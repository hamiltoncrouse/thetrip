import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resolveAccount } from "@/lib/request-account";
import { AuthError } from "@/lib/auth";

const updateDaySchema = z.object({
  city: z.string().optional(),
  notes: z.string().optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: { tripId: string; dayId: string } },
) {
  try {
    const { account } = await resolveAccount(request);
    const json = await request.json();
    const parsed = updateDaySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { tripId, dayId } = context.params;

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

    const updated = await prisma.tripDay.update({
      where: { id: dayId },
      data: {
        city: parsed.data.city ?? day.city,
        notes: parsed.data.notes ?? day.notes,
      },
    });

    return NextResponse.json({
      day: {
        id: updated.id,
        date: updated.date,
        city: updated.city,
        notes: updated.notes,
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error updating day", error);
    return NextResponse.json({ error: "Failed to update day." }, { status: 500 });
  }
}
