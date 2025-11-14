import { serverEnv } from "@/lib/env";

const TOKEN_URL = "https://api.amadeus.com/v1/security/oauth2/token";
const TEST_TOKEN_URL = "https://test.api.amadeus.com/v1/security/oauth2/token";
const API_BASE = "https://api.amadeus.com";
const TEST_API_BASE = "https://test.api.amadeus.com";

type TokenState = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: TokenState | null = null;

function getBaseUrls() {
  const isProduction = serverEnv.AMADEUS_ENV === "production";
  return {
    tokenUrl: isProduction ? TOKEN_URL : TEST_TOKEN_URL,
    apiBase: isProduction ? API_BASE : TEST_API_BASE,
  } as const;
}

function ensureCredentials() {
  if (!serverEnv.AMADEUS_CLIENT_ID || !serverEnv.AMADEUS_CLIENT_SECRET) {
    throw new Error("Amadeus credentials are not configured");
  }
}

export async function getAmadeusToken() {
  ensureCredentials();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }
  const { tokenUrl } = getBaseUrls();
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: serverEnv.AMADEUS_CLIENT_ID as string,
    client_secret: serverEnv.AMADEUS_CLIENT_SECRET as string,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus auth failed (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export type HotelSearchParams = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  adults?: number;
  checkIn: string;
  checkOut?: string;
  currency?: string;
  limit?: number;
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

type GeoHotelLookupParams = {
  apiBase: string;
  token: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
};

async function fetchHotelIdsByGeo({ apiBase, token, latitude, longitude, radiusKm }: GeoHotelLookupParams) {
  const geoUrl = new URL("/v1/reference-data/locations/hotels/by-geocode", apiBase);
  geoUrl.searchParams.set("latitude", latitude.toString());
  geoUrl.searchParams.set("longitude", longitude.toString());
  geoUrl.searchParams.set("radius", String(radiusKm ?? 15));
  geoUrl.searchParams.set("radiusUnit", "KM");
  geoUrl.searchParams.set("page[limit]", "20");

  const response = await fetch(geoUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus hotel lookup failed (${response.status}): ${text}`);
  }

  type GeoHotel = {
    hotelId?: string;
  };

  type GeoResponse = {
    data?: GeoHotel[];
  };

  const payload = (await response.json()) as GeoResponse;
  return (payload.data || []).map((entry) => entry.hotelId).filter(Boolean) as string[];
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  ensureCredentials();
  const token = await getAmadeusToken();
  const { apiBase } = getBaseUrls();
  const hotelIds = await fetchHotelIdsByGeo({
    apiBase,
    token,
    latitude: params.latitude,
    longitude: params.longitude,
    radiusKm: params.radiusKm,
  });

  if (!hotelIds.length) {
    return [];
  }

  const url = new URL("/v2/shopping/hotel-offers", apiBase);
  url.searchParams.set("hotelIds", hotelIds.slice(0, 20).join(","));
  url.searchParams.set("adults", String(params.adults ?? 2));
  url.searchParams.set("roomQuantity", "1");
  url.searchParams.set("bestRateOnly", "true");
  url.searchParams.set("view", "FULL");
  url.searchParams.set("sort", "PRICE");
  url.searchParams.set("checkInDate", params.checkIn);
  if (params.checkOut) url.searchParams.set("checkOutDate", params.checkOut);
  if (params.currency) url.searchParams.set("currency", params.currency);
  if (params.limit) url.searchParams.set("page[limit]", String(params.limit));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus hotels failed (${response.status}): ${text}`);
  }
  type RawHotelOffer = {
    id?: string;
    hotel?: {
      hotelId?: string;
      name?: string;
      distance?: { value?: number };
      address?: { lines?: string[]; cityName?: string };
    };
    offers?: Array<{
      id?: string;
      self?: string;
      price?: { total?: string; currency?: string };
      room?: { description?: { text?: string } };
    }>;
  };

  type AmadeusSearchResponse = {
    data?: RawHotelOffer[];
  };

  const payload = (await response.json()) as AmadeusSearchResponse;
  const offers = Array.isArray(payload?.data) ? payload.data : [];
  return offers.map((entry) => {
    const primaryOffer = Array.isArray(entry?.offers) ? entry.offers[0] : null;
    return {
      id: entry?.hotel?.hotelId || entry?.id || primaryOffer?.id || crypto.randomUUID(),
      name: entry?.hotel?.name || "Hotel",
      distanceKm: entry?.hotel?.distance?.value,
      address: [entry?.hotel?.address?.lines?.join(", "), entry?.hotel?.address?.cityName]
        .filter(Boolean)
        .join(", "),
      price: primaryOffer?.price?.total ? Number(primaryOffer.price.total) : undefined,
      currency: primaryOffer?.price?.currency,
      description: primaryOffer?.room?.description?.text,
      offer: primaryOffer?.self || primaryOffer?.id,
    } satisfies HotelOffer;
  });
}
