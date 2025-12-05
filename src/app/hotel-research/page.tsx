"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type HotelResult = {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  mapsUrl?: string;
};

export default function HotelResearchPage() {
  const params = useSearchParams();
  const initialCity = params.get("city") || "";
  const [query, setQuery] = useState(initialCity);
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchHotels(event?: React.FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (!query.trim()) {
      setHotels([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/hotels?city=${encodeURIComponent(query.trim())}`);
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
            Search hotels in a city. Results link directly to Google Maps for details and booking info.
          </p>
        </header>

        <form onSubmit={searchHotels} className="flex flex-col gap-3 rounded-lg border-2 border-dayglo-void bg-white p-4 shadow-hard-sm sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
            placeholder="City (e.g., Miami Beach)"
          />
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
              </div>
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
