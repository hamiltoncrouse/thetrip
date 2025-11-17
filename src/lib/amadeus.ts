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
  reviewScore?: number;
};

const BOOKING_HOST = serverEnv.BOOKING_RAPIDAPI_HOST;
const BOOKING_KEY = serverEnv.BOOKING_RAPIDAPI_KEY;

function ensureBookingCredentials() {
  if (!BOOKING_HOST || !BOOKING_KEY) {
    throw new Error("Booking.com RapidAPI credentials are not configured");
  }
}

export async function searchHotels(
  params: HotelSearchParams & { page?: number; pageSize?: number; priceMin?: number; priceMax?: number },
): Promise<HotelOffer[]> {
  ensureBookingCredentials();
  const host = BOOKING_HOST as string;
  const key = BOOKING_KEY as string;
  const baseUrl = `https://${host}`;

  const destination = await resolveDestination({ baseUrl, key, host, cityName: params.cityName });
  if (!destination) {
    return buildFallbackHotels(params);
  }

  const url = new URL("/api/v1/hotels/searchHotels", baseUrl);
  url.searchParams.set("dest_id", destination.destId);
  url.searchParams.set("search_type", destination.searchType ?? "CITY");
  url.searchParams.set("adults", String(params.adults ?? 2));
  url.searchParams.set("children_age", "0");
  url.searchParams.set("room_qty", "1");
  url.searchParams.set("page_number", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.pageSize ?? params.limit ?? 20));
  url.searchParams.set("units", "metric");
  url.searchParams.set("temperature_unit", "c");
  url.searchParams.set("languagecode", "en-us");
  url.searchParams.set("currency_code", params.currency || "USD");
  url.searchParams.set("location", destination.countryCode || "US");
  url.searchParams.set("arrival_date", params.checkIn);
  url.searchParams.set("departure_date", params.checkOut ?? buildCheckOut(params.checkIn));
  if (params.priceMin) url.searchParams.set("price_min", String(params.priceMin));
  if (params.priceMax) url.searchParams.set("price_max", String(params.priceMax));

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      console.warn("Booking.com rate limit hit", text);
      return buildFallbackHotels(params);
    }
    throw new Error(`Booking.com search failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as BookingSearchResponse;
  console.log("Booking search raw", JSON.stringify(payload).slice(0, 2000));
  const listingsCandidate =
    payload?.data?.propertySearchListings || payload?.data?.result || payload?.result || payload?.data?.hotels;
  const listings = Array.isArray(listingsCandidate) ? listingsCandidate : [];

  const hotels = listings
    .map((entry) => normalizeBookingHotel(entry, params))
    .filter((hotel): hotel is HotelOffer => Boolean(hotel));

  return hotels.length ? hotels : buildFallbackHotels(params);
}

type DestinationResult = {
  destId: string;
  searchType?: string;
  countryCode?: string;
};

type BookingLocationItem = {
  dest_id?: string | number;
  dest_type?: string;
  search_type?: string;
  country_code?: string;
};

type BookingLocationResponse = BookingLocationItem[] | { data?: BookingLocationItem[] };

type BookingSearchResponse = {
  data?: {
    propertySearchListings?: BookingHotelResult[];
    result?: BookingHotelResult[];
    hotels?: BookingHotelResult[];
  };
  result?: BookingHotelResult[];
  hotels?: BookingHotelResult[];
};

type BookingHotelResult = {
  hotel_id?: number;
  propertyId?: string;
  propertyName?: string;
  property?: {
    name?: string;
    wishlistName?: string;
    priceBreakdown?: {
      grossPrice?: {
        value?: number;
        currency?: string;
      };
    };
    destinationInfo?: {
      displayLocation?: string;
      city?: string;
      distanceFromDestination?: {
        value?: number;
        unit?: string;
      };
    };
    reviewScoreWord?: string;
    reviewScore?: number;
    latitude?: number;
    longitude?: number;
  };
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
  const url = new URL("/api/v1/hotels/searchDestination", baseUrl);
  url.searchParams.set("query", cityName);
  url.searchParams.set("languagecode", "en-us");

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      console.warn("Booking.com destination lookup rate limit", text);
      return null;
    }
    throw new Error(`Booking.com destination lookup failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as BookingLocationResponse;
  console.log("Booking destination raw", JSON.stringify(data).slice(0, 2000));
  const hits = Array.isArray(data) ? data : data?.data || [];
  const hit = hits[0];
  if (!hit?.dest_id) return null;
  return {
    destId: String(hit.dest_id),
    searchType: hit.search_type || hit.dest_type || "CITY",
    countryCode: hit.country_code || "US",
  };
}

function normalizeBookingHotel(entry: BookingHotelResult, params: HotelSearchParams): HotelOffer | null {
  const id = entry.propertyId
    ? String(entry.propertyId)
    : entry.hotel_id
    ? String(entry.hotel_id)
    : crypto.randomUUID();
  const name = entry.property?.name?.trim() || entry.propertyName?.trim();
  if (!name) return null;

  const price = entry.property?.priceBreakdown?.grossPrice?.value;
  const currency = entry.property?.priceBreakdown?.grossPrice?.currency || params.currency || "USD";
  const distanceValue = entry.property?.destinationInfo?.distanceFromDestination?.value;
  const distanceUnit = entry.property?.destinationInfo?.distanceFromDestination?.unit;
  const distanceKm = typeof distanceValue === "number" ? convertDistance(distanceValue, distanceUnit) : undefined;
  const address =
    entry.property?.destinationInfo?.displayLocation || entry.property?.destinationInfo?.city || params.cityName;
  const reviewScore = entry.property?.reviewScore;
  const reviewWord = entry.property?.reviewScoreWord;
  const description = reviewWord
    ? `${reviewWord}${reviewScore ? ` • ${reviewScore.toFixed(1)}` : ""} • Booking.com`
    : reviewScore
    ? `${reviewScore.toFixed(1)} / 10 • Booking.com`
    : undefined;

  return {
    id,
    name,
    distanceKm,
    address,
    price: price ?? undefined,
    currency,
    description,
    offer: undefined,
    reviewScore: reviewScore ?? undefined,
  };
}

function convertDistance(value: number, unit?: string) {
  if (!unit) return value;
  return unit.toLowerCase().startsWith("mi") ? value * 1.60934 : value;
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
