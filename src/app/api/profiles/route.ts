import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authenticateRequest, AuthError } from "@/lib/auth";

const profileSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  travelerType: z.string().optional(),
  kids: z.array(z.string()).optional(),
  preferences: z.record(z.string(), z.number()).optional(),
  budget: z.string().optional(),
  pace: z.string().optional(),
  mobility: z.string().optional(),
  goals: z.string().optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { account } = await authenticateRequest(request);
    const profiles = (account.savedProfiles as unknown[]) || [];
    return NextResponse.json({ profiles });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error fetching profiles", error);
    return NextResponse.json({ error: "Failed to load profiles." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { account } = await authenticateRequest(request);
    const json = await request.json();
    const parsed = profileSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const incoming = parsed.data;
    const existing = ((account.savedProfiles as unknown[]) || []) as Array<Record<string, unknown>>;
    const profileId = incoming.id || crypto.randomUUID();
    const nextProfiles = existing.filter((p) => (p as { id?: string }).id !== profileId);
    nextProfiles.push({ ...incoming, id: profileId, updatedAt: new Date().toISOString() });

    await prisma.user.update({
      where: { id: account.id },
      data: { savedProfiles: nextProfiles as Prisma.InputJsonValue },
    });

    return NextResponse.json({ profiles: nextProfiles });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error saving profile", error);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
