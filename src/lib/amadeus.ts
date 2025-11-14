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

export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  ensureCredentials();
  const token = await getAmadeusToken();
  const { apiBase } = getBaseUrls();
  const url = new URL("/v2/shopping/hotel-offers", apiBase);
  url.searchParams.set("latitude", params.latitude.toString());
  url.searchParams.set("longitude", params.longitude.toString());
  url.searchParams.set("radius", String(params.radiusKm ?? 15));
  url.searchParams.set("radiusUnit", "KM");
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
  const payload = await response.json();
  const offers = Array.isArray(payload?.data) ? payload.data : [];
  return offers.map((entry: any) => {
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
