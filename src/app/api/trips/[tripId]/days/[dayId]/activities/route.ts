import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";
import { fetchTravelMetadata } from "@/lib/travel";

const createActivitySchema = z.object({
  title: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
  startLocation: z.string().optional(),
  type: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

function combineDateWithTime(dateValue: string | Date, time: string) {
  const [hours, minutes] = time.split(":" ).map((value) => Number.parseInt(value, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  const base = new Date(dateValue);
  if (Number.isNaN(base.valueOf())) {
    return null;
  }
  const datePart = base.toISOString().split("T")[0];
  const candidate = new Date(`${datePart}T${time}:00`);
  return Number.isNaN(candidate.valueOf()) ? null : candidate;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tripId: string; dayId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const json = await request.json();
    const parsed = createActivitySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { tripId, dayId } = await context.params;
    const day = await prisma.tripDay.findFirst({
      where: {
        id: dayId,
        tripId,
        trip: {
          OR: [
            { userId: account.id },
            account.email ? { collaborators: { some: { email: account.email } } } : undefined,
          ].filter(Boolean) as [{ userId: string } | { collaborators: { some: { email: string } } }],
        },
      },
    });

    if (!day) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }

    const startTime = combineDateWithTime(day.date, parsed.data.startTime);
    if (!startTime) {
      return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    }

    let endTime = parsed.data.endTime ? combineDateWithTime(day.date, parsed.data.endTime) : null;
    if (parsed.data.endTime && !endTime) {
      return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
    }
    if (endTime && endTime < startTime) {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    const travel = await fetchTravelMetadata(parsed.data.startLocation, parsed.data.location);

    const activity = await prisma.activity.create({
      data: {
        tripDayId: dayId,
        title: parsed.data.title,
        description: parsed.data.notes || null,
        location: parsed.data.location || null,
        startLocation: parsed.data.startLocation || null,
        travelDistanceMeters: travel?.distanceMeters ?? null,
        travelDurationSeconds: travel?.durationSeconds ?? null,
        travelSummary: travel?.summary ?? null,
        travelPolyline: travel?.polyline ?? null,
        startTime,
        endTime,
        type: parsed.data.type || null,
        source: parsed.data.type === "hotel" ? "hotel" : undefined,
        metadata: parsed.data.metadata ?? undefined,
      },
    });

    return NextResponse.json({ activity });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error creating activity", error);
    return NextResponse.json({ error: "Failed to create activity." }, { status: 500 });
  }
}
