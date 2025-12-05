import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";

const GOOGLE_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json" as const;
const GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json" as const;

async function getPlaceLocation(placeId: string, apiKey: string) {
  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    fields: "geometry/location,name,formatted_address",
  });
  const response = await fetch(`${GOOGLE_DETAILS_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    console.error("Google place details failed", await response.text());
    return null;
  }
  const data = await response.json();
  if (data.status !== "OK") return null;
  const loc = data.result?.geometry?.location;
  if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
  return {
    lat: loc.lat,
    lng: loc.lng,
    name: data.result?.name as string | undefined,
    address: data.result?.formatted_address as string | undefined,
  };
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: NextRequest) {
  if (!serverEnv.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const query = searchParams.get("query")?.trim();
  const minRating = Number(searchParams.get("minRating") || "0") || 0;
  const radiusMiles = Number(searchParams.get("radiusMiles") || "0") || 0;
  const anchorLat = Number(searchParams.get("anchorLat") || "0") || undefined;
  const anchorLng = Number(searchParams.get("anchorLng") || "0") || undefined;
  const anchorPlaceId = searchParams.get("anchorPlaceId")?.trim() || undefined;
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

  let anchor = anchorLat && anchorLng ? { lat: anchorLat, lng: anchorLng } : null;
  if (!anchor && anchorPlaceId) {
    anchor = await getPlaceLocation(anchorPlaceId, serverEnv.GOOGLE_MAPS_API_KEY);
  }

  const radiusMeters =
    radiusMiles > 0
      ? Math.min(50000, Math.round(radiusMiles * 1609.34))
      : anchor
      ? 16093 // default ~10 miles when anchoring without explicit radius
      : undefined;

  const params = new URLSearchParams({
    query: anchor ? "hotels" : `hotels in ${textQuery}`,
    key: serverEnv.GOOGLE_MAPS_API_KEY,
  });
  if (anchor) {
    params.set("location", `${anchor.lat},${anchor.lng}`);
    if (radiusMeters) params.set("radius", radiusMeters.toString());
  }

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
    geometry?: { location?: { lat?: number; lng?: number } };
  };

  const hotels = (data.results || [])
    .map((result: PlaceResult) => {
      const hotelLat = result.geometry?.location?.lat;
      const hotelLng = result.geometry?.location?.lng;
      const distanceMiles =
        anchor && typeof hotelLat === "number" && typeof hotelLng === "number"
          ? haversineMiles(anchor.lat, anchor.lng, hotelLat, hotelLng)
          : null;
      return {
        id: result.place_id,
        name: result.name,
        address: result.formatted_address,
        rating: result.rating,
        userRatingsTotal: result.user_ratings_total,
        priceLevel: result.price_level,
        mapsUrl: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
        distanceMiles,
        lat: hotelLat,
        lng: hotelLng,
      };
    })
    .filter((hotel: { rating?: number; priceLevel?: number }) => {
      if (minRating > 0 && (hotel.rating || 0) < minRating) return false;
      if (priceLevels.length && hotel.priceLevel !== undefined && !priceLevels.includes(hotel.priceLevel)) return false;
      return true;
    })
    .sort(
      (a: { rating?: number; distanceMiles?: number | null }, b: { rating?: number; distanceMiles?: number | null }) => {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
        if (a.distanceMiles != null && b.distanceMiles != null) return a.distanceMiles - b.distanceMiles;
        return 0;
      },
    );

  return NextResponse.json({ hotels });
}
