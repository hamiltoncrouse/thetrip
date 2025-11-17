import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ email: z.string().email() });

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const { tripId } = await context.params;
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.userId !== account.id) {
      return NextResponse.json({ error: "Trip not found or not owned" }, { status: 404 });
    }

    await prisma.tripCollaborator.upsert({
      where: { tripId_email: { tripId, email: parsed.data.email.toLowerCase() } },
      update: {},
      create: { tripId, email: parsed.data.email.toLowerCase() },
    });

    return NextResponse.json({ added: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error adding collaborator", error);
    return NextResponse.json({ error: "Failed to add collaborator" }, { status: 500 });
  }
}
