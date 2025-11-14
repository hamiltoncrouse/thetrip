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

const RAPID_HOST = serverEnv.RAPIDAPI_HOTELS_HOST;
const RAPID_KEY = serverEnv.RAPIDAPI_HOTELS_KEY;

function ensureRapidCredentials() {
  if (!RAPID_HOST || !RAPID_KEY) {
    throw new Error("Hotels.com RapidAPI credentials are not configured");
  }
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  ensureRapidCredentials();
  const host = RAPID_HOST as string;
  const key = RAPID_KEY as string;
  const baseUrl = `https://${host}`;
  const url = new URL("/hotels/nearby", baseUrl);
  url.searchParams.set("latitude", params.latitude.toFixed(6));
  url.searchParams.set("longitude", params.longitude.toFixed(6));
  url.searchParams.set("checkIn", params.checkIn);
  url.searchParams.set("checkOut", buildCheckOut(params.checkIn, params.checkOut));
  url.searchParams.set("adultsNumber", String(params.adults ?? 2));
  if (params.radiusKm) {
    url.searchParams.set("radius", params.radiusKm.toString());
  }
  url.searchParams.set("currency", params.currency || "USD");
  url.searchParams.set("locale", "en_US");
  url.searchParams.set("sortOrder", "PRICE");
  if (params.limit) {
    url.searchParams.set("pageNumber", "1");
    url.searchParams.set("pageSize", String(params.limit));
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
    throw new Error(`Hotels.com search failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as RapidHotelsResponse;
  const results = Array.isArray(payload?.searchResults?.results) ? payload.searchResults.results : [];

  return results
    .map((hotel) => normalizeHotel(hotel, params))
    .filter((hotel): hotel is HotelOffer => Boolean(hotel));
}

type RapidHotelsResponse = {
  searchResults?: {
    results?: RapidHotelResult[];
  };
};

type RapidHotelResult = {
  id?: string | number;
  name?: string;
  address?: {
    streetAddress?: string;
    locality?: string;
    countryName?: string;
    region?: string;
  };
  landmarks?: Array<{ label?: string; distance?: string }>;
  ratePlan?: {
    price?: {
      current?: string;
      exactCurrent?: number;
    };
  };
  urls?: {
    hotelInfositeUrl?: string;
    hotelSearchResultUrl?: string;
  };
  starRating?: number;
  neighborhood?: string;
};

function normalizeHotel(entry: RapidHotelResult, params: HotelSearchParams): HotelOffer | null {
  const id = String(entry.id ?? crypto.randomUUID());
  const name = entry.name?.trim();
  if (!name) return null;

  const priceValue =
    typeof entry.ratePlan?.price?.exactCurrent === "number"
      ? entry.ratePlan.price.exactCurrent
      : parseCurrency(entry.ratePlan?.price?.current);

  const addressParts = [
    entry.address?.streetAddress,
    entry.address?.locality,
    entry.address?.region,
    entry.address?.countryName,
  ].filter(Boolean);

  const address = addressParts.join(", ");
  const distanceKm = parseDistance(entry.landmarks);
  const offerUrl = buildOfferUrl(entry);
  const desc = entry.neighborhood ? `${entry.neighborhood} • Hotels.com` : undefined;

  return {
    id,
    name,
    distanceKm,
    address,
    price: priceValue ?? undefined,
    currency: params.currency || "USD",
    description: desc,
    offer: offerUrl,
  };
}

function buildOfferUrl(entry: RapidHotelResult) {
  if (entry.urls?.hotelInfositeUrl) {
    return `https://www.hotels.com${entry.urls.hotelInfositeUrl}`;
  }
  if (entry.urls?.hotelSearchResultUrl) {
    return `https://www.hotels.com${entry.urls.hotelSearchResultUrl}`;
  }
  return entry.id ? `https://www.hotels.com/ho${entry.id}` : undefined;
}

function parseCurrency(value?: string | number | null) {
  if (typeof value === "number") return value;
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDistance(landmarks?: Array<{ label?: string; distance?: string }>) {
  const distanceText = landmarks?.find((item) => item?.distance)?.distance;
  if (!distanceText) return undefined;
  const match = distanceText.match(/([0-9.]+)/);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return undefined;
  if (/mile/i.test(distanceText)) {
    return value * 1.60934;
  }
  return value;
}

function buildCheckOut(checkIn: string, provided?: string) {
  if (provided) return provided;
  const date = new Date(checkIn);
  if (Number.isNaN(date.valueOf())) {
    return checkIn;
  }
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}
