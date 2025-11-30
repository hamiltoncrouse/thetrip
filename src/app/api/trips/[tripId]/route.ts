import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";

const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  homeCity: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  profileId: z.string().optional(),
  profile: z.record(z.string(), z.any()).optional(),
});

function parseDateInput(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return undefined;
  parsed.setUTCHours(12, 0, 0, 0);
  return parsed;
}

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const { tripId } = await context.params;

    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: account.id } });
    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    await prisma.trip.delete({ where: { id: tripId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error deleting trip", error);
    return NextResponse.json({ error: "Failed to delete trip." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const json = await request.json();
    const parsed = updateTripSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { tripId } = await context.params;
    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: account.id } });
    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.homeCity !== undefined) updateData.homeCity = parsed.data.homeCity;
    if (parsed.data.startDate !== undefined)
      updateData.startDate = parseDateInput(parsed.data.startDate) ?? null;
    if (parsed.data.endDate !== undefined)
      updateData.endDate = parseDateInput(parsed.data.endDate) ?? null;
    if (parsed.data.profile !== undefined) updateData.profile = parsed.data.profile ?? undefined;
    if (parsed.data.profileId !== undefined) updateData.profileId = parsed.data.profileId ?? undefined;

    const updated = await prisma.trip.update({ where: { id: tripId }, data: updateData });
    return NextResponse.json({ trip: updated });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error updating trip", error);
    return NextResponse.json({ error: "Failed to update trip." }, { status: 500 });
  }
}
