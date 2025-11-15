import crypto from "node:crypto";

import { serverEnv } from "@/lib/env";

export type HotelSearchParams = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  adults?: number;
  checkIn: string;
  checkOut?: string;
  currency?: string;
  limit?: number;
  cityName?: string;
};

export type HotelOffer = {
  id: string;
  name: string;
  distanceKm?: number;
  address?: string;
  price?: number;
  currency?: string;
  description?: string;
  offer?: string;
};

const BOOKING_HOST = serverEnv.BOOKING_RAPIDAPI_HOST;
const BOOKING_KEY = serverEnv.BOOKING_RAPIDAPI_KEY;

function ensureBookingCredentials() {
  if (!BOOKING_HOST || !BOOKING_KEY) {
    throw new Error("Booking.com RapidAPI credentials are not configured");
  }
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  ensureBookingCredentials();
  const host = BOOKING_HOST as string;
  const key = BOOKING_KEY as string;
  const baseUrl = `https://${host}`;

  const destination = await resolveDestination({
    baseUrl,
    key,
    host,
    cityName: params.cityName,
  });

  if (!destination) {
    return buildFallbackHotels(params);
  }

  const url = new URL("/v1/hotels/search", baseUrl);
  url.searchParams.set("dest_id", destination.destId);
  url.searchParams.set("search_type", destination.searchType ?? "CITY");
  url.searchParams.set("checkin_date", params.checkIn);
  url.searchParams.set("checkout_date", buildCheckOut(params.checkIn, params.checkOut));
  url.searchParams.set("adults_number", String(params.adults ?? 2));
  url.searchParams.set("room_number", "1");
  url.searchParams.set("order_by", "price");
  url.searchParams.set("units", "metric");
  url.searchParams.set("locale", "en-us");
  url.searchParams.set("children_number", "0");
  url.searchParams.set("filter_by_currency", params.currency || "USD");
  if (params.limit) {
    url.searchParams.set("page_number", "0");
    url.searchParams.set("rows", String(params.limit));
  }

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Booking.com search failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as BookingSearchResponse;
  const results = Array.isArray(payload?.result) ? payload.result : [];

  const hotels = results
    .map((entry) => normalizeBookingHotel(entry, params))
    .filter((hotel): hotel is HotelOffer => Boolean(hotel));

  return hotels.length ? hotels : buildFallbackHotels(params);
}

type DestinationResult = {
  destId: string;
  searchType?: string;
};

async function resolveDestination({
  baseUrl,
  key,
  host,
  cityName,
}: {
  baseUrl: string;
  key: string;
  host: string;
  cityName?: string | null;
}): Promise<DestinationResult | null> {
  if (!cityName) return null;
  const url = new URL("/v1/hotels/locations", baseUrl);
  url.searchParams.set("name", cityName);
  url.searchParams.set("locale", "en-us");

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Booking.com destination lookup failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as BookingLocationResponse;
  const hit = Array.isArray(data) ? data[0] : undefined;
  if (!hit?.dest_id) return null;
  return {
    destId: String(hit.dest_id),
    searchType: hit.dest_type || "CITY",
  };
}

type BookingLocationResponse = Array<{
  dest_id?: string | number;
  dest_type?: string;
}>;

type BookingSearchResponse = {
  result?: BookingHotelResult[];
};

type BookingHotelResult = {
  hotel_id?: number;
  hotel_name?: string;
  distance_to_cc?: string;
  min_total_price?: number;
  price_breakdown?: {
    gross_price?: number;
    currency?: string;
  };
  currencycode?: string;
  address?: string;
  city_trans?: string;
  review_score_word?: string;
  url?: string;
};

function normalizeBookingHotel(entry: BookingHotelResult, params: HotelSearchParams): HotelOffer | null {
  const id = entry.hotel_id ? String(entry.hotel_id) : crypto.randomUUID();
  const name = entry.hotel_name?.trim();
  if (!name) return null;

  const price =
    typeof entry.min_total_price === "number"
      ? entry.min_total_price
      : entry.price_breakdown?.gross_price;
  const currency = entry.currencycode || entry.price_breakdown?.currency || params.currency || "USD";
  const distanceKm = parseDistanceToKm(entry.distance_to_cc);
  const address = entry.address || entry.city_trans || params.cityName;
  const description = entry.review_score_word ? `${entry.review_score_word} • Booking.com` : undefined;

  return {
    id,
    name,
    distanceKm,
    address,
    price: price ?? undefined,
    currency,
    description,
    offer: entry.url,
  };
}

function parseDistanceToKm(value?: string) {
  if (!value) return undefined;
  const match = value.match(/([0-9.]+)/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed)) return undefined;
  if (value.toLowerCase().includes("mi")) {
    return parsed * 1.60934;
  }
  return parsed;
}

function buildCheckOut(checkIn: string, provided?: string) {
  if (provided) return provided;
  const date = new Date(checkIn);
  if (Number.isNaN(date.valueOf())) return checkIn;
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

function buildFallbackHotels(params: HotelSearchParams): HotelOffer[] {
  const cityLabel = params.cityName ? params.cityName : "your destination";
  return [
    {
      id: `${cityLabel}-1`,
      name: `${cityLabel} Lights Hotel`,
      address: `${cityLabel} city center`,
      distanceKm: 1.2,
      price: 240,
      currency: params.currency || "USD",
      description: "Boutique stay with rooftop lounge and neon-lit suites.",
    },
    {
      id: `${cityLabel}-2`,
      name: `Midnight ${cityLabel} Residences`,
      address: `${cityLabel} arts district`,
      distanceKm: 2.4,
      price: 185,
      currency: params.currency || "USD",
      description: "Loft-style rooms, late checkout, vinyl library in the lobby.",
    },
    {
      id: `${cityLabel}-3`,
      name: `${cityLabel} Soundwave Inn`,
      address: `${cityLabel} waterfront`,
      distanceKm: 3.1,
      price: 320,
      currency: params.currency || "USD",
      description: "Poolside cabanas, on-site espresso bar, bikes for dawn rides.",
    },
  ];
}
