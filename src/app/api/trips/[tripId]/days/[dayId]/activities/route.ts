import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";

const createActivitySchema = z.object({
  title: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

function combineDateWithTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":" ).map((value) => Number.parseInt(value, 10));
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
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
        trip: { userId: account.id },
      },
    });

    if (!day) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }

    const startTime = combineDateWithTime(new Date(day.date), parsed.data.time);

    const activity = await prisma.activity.create({
      data: {
        tripDayId: dayId,
        title: parsed.data.title,
        description: parsed.data.notes || null,
        startTime,
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
