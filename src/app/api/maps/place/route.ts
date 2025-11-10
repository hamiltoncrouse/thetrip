import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";

const GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json" as const;

export async function GET(request: NextRequest) {
  if (!serverEnv.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim();
  if (!placeId) {
    return NextResponse.json({ error: "Missing placeId." }, { status: 400 });
  }

  const params = new URLSearchParams({
    place_id: placeId,
    key: serverEnv.GOOGLE_MAPS_API_KEY,
    fields: "formatted_address,name,geometry/location,place_id",
  });

  const response = await fetch(`${GOOGLE_DETAILS_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    console.error("Google place details failed", await response.text());
    return NextResponse.json({ error: "Failed to load place." }, { status: 502 });
  }

  const data = await response.json();
  if (data.status !== "OK") {
    console.warn("Place details status", data.status, data.error_message);
    return NextResponse.json({ error: data.error_message || "No details." }, { status: 200 });
  }

  const result = data.result;
  return NextResponse.json({
    placeId: result.place_id,
    name: result.name,
    address: result.formatted_address,
    location: {
      lat: result.geometry?.location?.lat,
      lng: result.geometry?.location?.lng,
    },
  });
}
