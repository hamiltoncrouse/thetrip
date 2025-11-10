import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

function combineDateWithTime(dateIso: string, time: string) {
  const [hours, minutes] = time.split(":" ).map((value) => Number.parseInt(value, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  const base = new Date(dateIso);
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
