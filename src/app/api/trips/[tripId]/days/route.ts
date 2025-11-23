import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";

const createDaySchema = z.object({
  date: z.string().min(1),
  city: z.string().min(1),
  notes: z.string().optional(),
  cityPlaceId: z.string().nullable().optional(),
  cityLatitude: z.number().nullable().optional(),
  cityLongitude: z.number().nullable().optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

function parseDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  parsed.setUTCHours(12, 0, 0, 0);
  return parsed;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    const { account } = await authenticateRequest(request);
    const json = await request.json();
    const parsed = createDaySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { tripId } = await context.params;
    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: account.id } });
    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const dateValue = parseDate(parsed.data.date);
    if (!dateValue) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const day = await prisma.tripDay.create({
      data: {
        tripId,
        date: dateValue,
        city: parsed.data.city,
        notes: parsed.data.notes || null,
        cityPlaceId:
          parsed.data.cityPlaceId === undefined ? null : parsed.data.cityPlaceId,
        cityLatitude:
          parsed.data.cityLatitude === undefined ? null : parsed.data.cityLatitude,
        cityLongitude:
          parsed.data.cityLongitude === undefined ? null : parsed.data.cityLongitude,
      },
    });

    return NextResponse.json({
      day: {
        id: day.id,
        date: day.date,
        city: day.city,
        notes: day.notes,
        cityPlaceId: day.cityPlaceId,
        cityLatitude: day.cityLatitude,
        cityLongitude: day.cityLongitude,
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error creating day", error);
    return NextResponse.json({ error: "Failed to create day." }, { status: 500 });
  }
}
