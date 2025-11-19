import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";
import { fetchTravelMetadata } from "@/lib/travel";

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
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

async function assertOwnership(
  userId: string,
  tripId: string,
  dayId: string,
  activityId: string,
) {
  return prisma.activity.findFirst({
    where: {
      id: activityId,
      tripDayId: dayId,
      tripDay: {
        tripId,
        trip: { userId },
      },
    },
    include: {
      tripDay: true,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tripId: string; dayId: string; activityId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const json = await request.json();
    const parsed = updateActivitySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { tripId, dayId, activityId } = await context.params;
    const existing = await assertOwnership(account.id, tripId, dayId, activityId);
    if (!existing) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.notes !== undefined) updates.description = parsed.data.notes;
    if (parsed.data.location !== undefined) updates.location = parsed.data.location || null;
    if (parsed.data.startLocation !== undefined) updates.startLocation = parsed.data.startLocation || null;
    if (parsed.data.type !== undefined) updates.type = parsed.data.type || null;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata ?? undefined;

    if (parsed.data.startTime) {
      const value = combineDateWithTime(existing.tripDay.date, parsed.data.startTime);
      if (!value) return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
      updates.startTime = value;
    }
    if (parsed.data.endTime) {
      const value = combineDateWithTime(existing.tripDay.date, parsed.data.endTime);
      if (!value) return NextResponse.json({ error: "Invalid end time" }, { status: 400 });
      updates.endTime = value;
    }

    if (updates.endTime && updates.startTime && updates.endTime < updates.startTime) {
      updates.endTime = new Date((updates.startTime as Date).getTime() + 60 * 60 * 1000);
    }

    const nextStartLocation =
      parsed.data.startLocation !== undefined ? parsed.data.startLocation : existing.startLocation;
    const nextLocation = parsed.data.location !== undefined ? parsed.data.location : existing.location;

    if (parsed.data.startLocation !== undefined || parsed.data.location !== undefined) {
      if (nextStartLocation && nextLocation) {
        const travel = await fetchTravelMetadata(nextStartLocation, nextLocation);
        updates.travelDistanceMeters = travel?.distanceMeters ?? null;
        updates.travelDurationSeconds = travel?.durationSeconds ?? null;
        updates.travelSummary = travel?.summary ?? null;
        updates.travelPolyline = travel?.polyline ?? null;
      } else {
        updates.travelDistanceMeters = null;
        updates.travelDurationSeconds = null;
        updates.travelSummary = null;
        updates.travelPolyline = null;
      }
    }

    const updated = await prisma.activity.update({ where: { id: activityId }, data: updates });
    return NextResponse.json({ activity: updated });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error updating activity", error);
    return NextResponse.json({ error: "Failed to update activity." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tripId: string; dayId: string; activityId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const { tripId, dayId, activityId } = await context.params;
    const existing = await assertOwnership(account.id, tripId, dayId, activityId);
    if (!existing) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    await prisma.activity.delete({ where: { id: activityId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error deleting activity", error);
    return NextResponse.json({ error: "Failed to delete activity." }, { status: 500 });
  }
}
