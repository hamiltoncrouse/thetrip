import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";

const GOOGLE_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json" as const;

export async function GET(request: NextRequest) {
  if (!serverEnv.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const query = searchParams.get("query")?.trim();
  const minRating = Number(searchParams.get("minRating") || "0") || 0;
  const radiusMiles = Number(searchParams.get("radiusMiles") || "0") || 0;
  const priceLevelsParam = searchParams.get("priceLevels");
  const priceLevels =
    priceLevelsParam
      ?.split(",")
      .map((val) => Number(val))
      .filter((val) => !Number.isNaN(val) && val >= 0 && val <= 4) || [];
  const textQuery = query || city;

  if (!textQuery) {
    return NextResponse.json({ hotels: [], error: "Missing city or query." }, { status: 400 });
  }

  const radiusPart = radiusMiles > 0 ? ` within ${radiusMiles} miles` : "";

  const params = new URLSearchParams({
    query: `hotels in ${textQuery}${radiusPart}`,
    key: serverEnv.GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`${GOOGLE_TEXT_SEARCH_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    console.error("Google textsearch failed", await response.text());
    return NextResponse.json({ error: "Failed to search hotels." }, { status: 502 });
  }

  const data = await response.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("Hotel textsearch status", data.status, data.error_message);
    return NextResponse.json({ hotels: [], error: data.error_message || "No results" }, { status: 200 });
  }

  type PlaceResult = {
    place_id: string;
    name: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
  };

  const hotels = (data.results || [])
    .map((result: PlaceResult) => ({
      id: result.place_id,
      name: result.name,
      address: result.formatted_address,
      rating: result.rating,
      userRatingsTotal: result.user_ratings_total,
      priceLevel: result.price_level,
      mapsUrl: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
    }))
    .filter((hotel: { rating?: number; priceLevel?: number }) => {
      if (minRating > 0 && (hotel.rating || 0) < minRating) return false;
      if (priceLevels.length && !priceLevels.includes(hotel.priceLevel ?? -1)) return false;
      return true;
    })
    .sort(
      (a: { rating?: number }, b: { rating?: number }) => (b.rating || 0) - (a.rating || 0),
    );

  return NextResponse.json({ hotels });
}
