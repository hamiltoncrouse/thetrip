import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";

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
