import { serverEnv } from "@/lib/env";

type TravelMetadata = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  summary: string | null;
  polyline: string | null;
};

export async function fetchTravelMetadata(origin?: string | null, destination?: string | null) {
  if (!origin || !destination) return null;
  if (!serverEnv.GOOGLE_MAPS_API_KEY) return null;

  const params = new URLSearchParams({
    origin,
    destination,
    mode: "driving",
    key: serverEnv.GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Directions request failed", await response.text());
    return null;
  }

  const data = await response.json();
  if (data.status !== "OK") {
    console.warn("Directions status", data.status, data.error_message);
    return null;
  }

  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  if (!route || !leg) return null;

  return {
    distanceMeters: leg.distance?.value ?? null,
    durationSeconds: leg.duration?.value ?? null,
    summary: [leg.duration?.text, leg.distance?.text].filter(Boolean).join(" • ") || null,
    polyline: route.overview_polyline?.points ?? null,
  } satisfies TravelMetadata;
}
