import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest, AuthError } from "@/lib/auth";
import { searchHotels } from "@/lib/amadeus";

const paramsSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  checkIn: z.string(),
  checkOut: z.string().optional(),
  adults: z.coerce.number().optional(),
  radius: z.coerce.number().optional(),
  currency: z.string().optional(),
});

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const url = new URL(request.url);
    const parsed = paramsSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const hotels = await searchHotels({
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
      radiusKm: parsed.data.radius,
      adults: parsed.data.adults,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      currency: parsed.data.currency,
    });

    return NextResponse.json({ hotels });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Hotel search failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hotel search failed" }, { status: 500 });
  }
}
