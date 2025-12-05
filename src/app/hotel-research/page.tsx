"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type HotelResult = {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  mapsUrl?: string;
  distanceMiles?: number | null;
  lat?: number | null;
  lng?: number | null;
};

type AnchorPlace = {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
};

function HotelResearchContent() {
  const params = useSearchParams();
  const initialCity = params.get("city") || "";
  const [query, setQuery] = useState(initialCity);
  const [radiusMiles, setRadiusMiles] = useState("");
  const [minRating, setMinRating] = useState("0");
  const [priceLevel, setPriceLevel] = useState("any");
  const [anchorInput, setAnchorInput] = useState("");
  const [anchorPlace, setAnchorPlace] = useState<AnchorPlace | null>(null);
  const [anchorSuggestions, setAnchorSuggestions] = useState<Array<{ placeId: string; description: string }>>([]);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedHotelId, setExpandedHotelId] = useState<string | null>(null);

  async function fetchAnchorSuggestions(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setAnchorSuggestions([]);
      return;
    }
    setAnchorLoading(true);
    try {
      const res = await fetch(`/api/maps/autocomplete?query=${encodeURIComponent(trimmed)}&types=establishment`);
      const data = await res.json();
      setAnchorSuggestions(data.predictions || []);
    } catch {
      setAnchorSuggestions([]);
    } finally {
      setAnchorLoading(false);
    }
  }

  async function selectAnchor(placeId: string, description: string) {
    try {
      const res = await fetch(`/api/maps/place?placeId=${encodeURIComponent(placeId)}`);
      const data = await res.json();
      if (data?.location?.lat && data?.location?.lng) {
        setAnchorPlace({
          placeId,
          description,
          lat: data.location.lat,
          lng: data.location.lng,
        });
        setAnchorInput(description);
        setAnchorSuggestions([]);
        if (!radiusMiles) setRadiusMiles("3");
      }
    } catch {
      // ignore
    }
  }

  async function searchHotels(event?: React.FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (!query.trim()) {
      setHotels([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ city: query.trim() });
      if (radiusMiles.trim()) params.set("radiusMiles", radiusMiles.trim());
      if (minRating !== "0") params.set("minRating", minRating);
      if (priceLevel !== "any") params.set("priceLevels", priceLevel);
      if (anchorPlace) {
        params.set("anchorLat", String(anchorPlace.lat));
        params.set("anchorLng", String(anchorPlace.lng));
        params.set("anchorPlaceId", anchorPlace.placeId);
      }
      const res = await fetch(`/api/maps/hotels?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Search failed");
      }
      const data = await res.json();
      setHotels(data.hotels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setHotels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialCity) {
      searchHotels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCity]);

  return (
    <div className="min-h-screen bg-paper px-6 py-10 text-dayglo-void">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-dayglo-pink">Hotel research</p>
          <h1 className="text-3xl font-black">Find stays via Google Maps</h1>
          <p className="text-sm text-dayglo-void/80">
            Search hotels in a city. Results link directly to Google Maps for details and booking info. Filter by distance,
            rating, and price level to get closer matches.
          </p>
        </header>

        <form
          onSubmit={searchHotels}
          className="flex flex-col gap-3 rounded-lg border-2 border-dayglo-void bg-white p-4 shadow-hard-sm sm:flex-row sm:flex-wrap"
        >
          <div className="flex-1 min-w-[220px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
              placeholder="City (e.g., Miami Beach)"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="relative">
              <input
                value={anchorInput}
                onChange={(e) => {
                  setAnchorInput(e.target.value);
                  setAnchorPlace(null);
                  fetchAnchorSuggestions(e.target.value);
                }}
                className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                placeholder="Anchor place (optional) e.g., The Louvre"
              />
              {anchorLoading && <p className="absolute right-2 top-2 text-[11px] text-dayglo-void/60">…</p>}
              {anchorSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border-2 border-dayglo-void bg-white shadow-hard-sm">
                  {anchorSuggestions.map((s) => (
                    <button
                      key={s.placeId}
                      type="button"
                      onClick={() => selectAnchor(s.placeId, s.description)}
                      className="block w-full px-3 py-2 text-left text-sm text-dayglo-void hover:bg-dayglo-yellow/40"
                    >
                      {s.description}
                    </button>
                  ))}
                </div>
              )}
              {anchorPlace && (
                <p className="mt-1 text-[11px] font-semibold text-dayglo-void/70">
                  Anchored near {anchorPlace.description}
                  <button
                    type="button"
                    onClick={() => {
                      setAnchorPlace(null);
                      setAnchorInput("");
                    }}
                    className="ml-2 text-dayglo-pink underline"
                  >
                    Clear
                  </button>
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap min-w-[260px]">
            <div className="flex flex-col">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void/70">Max distance (miles)</label>
              <input
                value={radiusMiles}
                onChange={(e) => setRadiusMiles(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="w-28 rounded-md border-2 border-dayglo-void bg-paper px-2 py-1 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                placeholder="e.g., 3"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void/70">Min rating</label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="w-28 rounded-md border-2 border-dayglo-void bg-paper px-2 py-1 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
              >
                <option value="0">Any</option>
                <option value="3.5">3.5+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void/70">Price level</label>
              <select
                value={priceLevel}
                onChange={(e) => setPriceLevel(e.target.value)}
                className="w-28 rounded-md border-2 border-dayglo-void bg-paper px-2 py-1 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
              >
                <option value="any">Any</option>
                <option value="1">$</option>
                <option value="2">$$</option>
                <option value="3">$$$</option>
                <option value="4">$$$$</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[1px] hover:shadow-none disabled:cursor-wait"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && <p className="text-sm text-rose-500">{error}</p>}

        <div className="grid gap-3">
          {hotels.map((hotel) => (
            <div key={hotel.id} className="rounded-lg border-2 border-dayglo-void bg-white p-4 shadow-hard-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-black text-dayglo-void">{hotel.name}</p>
                  {hotel.address && <p className="text-sm text-dayglo-void/80">{hotel.address}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedHotelId((prev) => (prev === hotel.id ? null : hotel.id))}
                    className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard-sm transition hover:bg-dayglo-yellow hover:translate-y-[1px] hover:shadow-none"
                  >
                    {expandedHotelId === hotel.id ? "Hide details" : "More details"}
                  </button>
                  {hotel.mapsUrl && (
                    <a
                      href={hotel.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[1px] hover:shadow-none"
                    >
                      Open in Maps
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-dayglo-void/80">
                {hotel.rating && (
                  <span className="rounded border border-dayglo-void/40 bg-dayglo-yellow/40 px-2 py-1">Rating {hotel.rating} ⭐</span>
                )}
                {hotel.userRatingsTotal && (
                  <span className="rounded border border-dayglo-void/40 bg-dayglo-yellow/40 px-2 py-1">{hotel.userRatingsTotal} reviews</span>
                )}
                {typeof hotel.priceLevel === "number" && (
                  <span className="rounded border border-dayglo-void/40 bg-dayglo-yellow/40 px-2 py-1">Price level {"$".repeat(hotel.priceLevel || 1)}</span>
                )}
                {typeof hotel.distanceMiles === "number" && (
                  <span className="rounded border border-dayglo-void/40 bg-dayglo-cyan/50 px-2 py-1">
                    {hotel.distanceMiles.toFixed(1)} mi from anchor
                  </span>
                )}
              </div>
              {expandedHotelId === hotel.id && (
                <div className="mt-3 rounded-lg border-2 border-dayglo-void bg-dayglo-yellow/20 p-3 shadow-hard-sm">
                  {hotel.lat != null && hotel.lng != null && (
                    <img
                      src={`/api/maps/static?lat=${hotel.lat}&lng=${hotel.lng}&zoom=14`}
                      alt={`Map of ${hotel.name}`}
                      className="mb-3 h-48 w-full rounded-md border-2 border-dayglo-void object-cover"
                      loading="lazy"
                    />
                  )}
                  {hotel.address && <p className="text-sm font-semibold text-dayglo-void">{hotel.address}</p>}
                  {typeof hotel.distanceMiles === "number" && (
                    <p className="text-xs font-semibold text-dayglo-void/70">About {hotel.distanceMiles.toFixed(1)} miles from anchor</p>
                  )}
                  {hotel.userRatingsTotal && (
                    <p className="text-xs text-dayglo-void/70">
                      {hotel.userRatingsTotal} reviews. For detailed reviews and photos, open in Google Maps.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && hotels.length === 0 && !error && (
            <p className="text-sm text-dayglo-void/80">No hotels yet. Search above to see results.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HotelResearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-dayglo-void">Loading hotel search…</div>}>
      <HotelResearchContent />
    </Suspense>
  );
}
