import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap" as const;

export async function GET(request: NextRequest) {
  if (!serverEnv.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const zoom = searchParams.get("zoom") || "13";
  const path = searchParams.get("path");

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing coordinates." }, { status: 400 });
  }

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom,
    size: "600x320",
    scale: "2",
    maptype: "roadmap",
    markers: `color:0xff47da|${lat},${lng}`,
    key: serverEnv.GOOGLE_MAPS_API_KEY,
  });

  if (path) {
    params.append("path", `weight:4|color:0x66f6ff|enc:${path}`);
  }

  const response = await fetch(`${STATIC_MAP_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    console.error("Static map failed", await response.text());
    return NextResponse.json({ error: "Failed to render map." }, { status: 502 });
  }

  const arrayBuffer = await response.arrayBuffer();
  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}
