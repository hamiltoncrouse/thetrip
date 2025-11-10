import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";

const GOOGLE_AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json" as const;

type Prediction = {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
};

export async function GET(request: NextRequest) {
  if (!serverEnv.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  const sessionToken = searchParams.get("sessionToken")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  const params = new URLSearchParams({
    input: query,
    types: "(cities)",
    key: serverEnv.GOOGLE_MAPS_API_KEY,
  });
  if (sessionToken) params.set("sessiontoken", sessionToken);

  const response = await fetch(`${GOOGLE_AUTOCOMPLETE_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    console.error("Google autocomplete failed", await response.text());
    return NextResponse.json({ error: "Failed to fetch suggestions." }, { status: 502 });
  }

  const data: { status: string; predictions: Prediction[]; error_message?: string } = await response.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("Autocomplete status", data.status, data.error_message);
    return NextResponse.json({ predictions: [], error: data.error_message }, { status: 200 });
  }

  const predictions = (data.predictions || []).map((prediction) => ({
    placeId: prediction.place_id,
    description: prediction.description,
    primary: prediction.structured_formatting?.main_text || prediction.description,
    secondary: prediction.structured_formatting?.secondary_text || "",
  }));

  return NextResponse.json({ predictions });
}
