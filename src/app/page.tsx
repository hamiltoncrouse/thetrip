"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

const manifestoCards = [
  {
    title: "VISUALS > CELLS",
    body:
      "Stop pasting reservation numbers into Excel. We hold your tickets, confirmations, and addresses in a visual timeline that actually looks like your trip feels.",
  },
  {
    title: "ASK FONDA",
    body:
      "Meet your neon-soaked travel consultant. Stuck on where to eat? Need a route fix? Fonda riffs on your itinerary to find hidden gems and vibe-matched spots instantly.",
  },
  {
    title: "HIVE MIND",
    body:
      "Planning solo is boring. Share the link. Let friends vote on spots. Keep everyone on the same wavelength without the endless \"Reply-All\" email chains.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { status, user, idToken, signInWithGoogle } = useAuth();
  const [tripOptions, setTripOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);

  const isAuthenticated = status === "ready" && Boolean(user && idToken);

  useEffect(() => {
    if (!isAuthenticated || !idToken) {
      setTripOptions([]);
      setTripError(null);
      return;
    }
    let cancelled = false;
    async function fetchTrips() {
      setLoadingTrips(true);
      setTripError(null);
      try {
        const res = await fetch("/api/trips", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to load trips");
        }
        const data = await res.json();
        if (!cancelled) {
          setTripOptions((data.trips || []).map((trip: { id: string; title: string }) => ({ id: trip.id, title: trip.title })));
        }
      } catch (err) {
        if (!cancelled) setTripError(err instanceof Error ? err.message : "Failed to load trips");
      } finally {
        if (!cancelled) setLoadingTrips(false);
      }
    }
    fetchTrips();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, idToken]);

  const headingTagline = useMemo(() => clientEnv.NEXT_PUBLIC_APP_NAME || "The Trip", []);

  return (
    <div className="min-h-screen bg-paper text-dayglo-void">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
        <header className="space-y-4 text-center">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-dayglo-pink">{headingTagline}</p>
          <h1 className="text-5xl font-black uppercase sm:text-7xl">
            <span className="bg-gradient-to-r from-dayglo-pink via-dayglo-lime to-dayglo-orange bg-clip-text text-transparent">
              THE TRIP
            </span>
          </h1>
          <p className="text-lg font-black uppercase text-dayglo-void">Kill the spreadsheet.</p>
          <h2 className="mx-auto max-w-3xl text-base font-semibold uppercase text-dayglo-void/80 sm:text-lg">
            Travel is a vibe, not a grid of cells. Plan visually, route intelligently, and keep the chaos under control.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-5 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
              >
                Open dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-5 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
              >
                Sign in with Google
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push("/start")}
              className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-5 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
            >
              Start a trip
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <ActionCard
            label="START A NEW TRIP"
            subtext="Drop a pin. Pick a date. Go."
            accent="bg-dayglo-lime"
            onClick={() => router.push("/start")}
          />
          <JumpBackCard
            label="JUMP BACK IN"
            subtext="Resume planning where you left off."
            accent="bg-dayglo-cyan"
            isAuthenticated={isAuthenticated}
            loading={loadingTrips}
            error={tripError}
            trips={tripOptions}
            onSignIn={() => signInWithGoogle()}
            onSelect={(tripId) => router.push(`/dashboard?tripId=${tripId}`)}
          />
          <JumpBackCard
            label="THE TIMELINE"
            subtext="Bird’s eye view of your logistics."
            accent="bg-dayglo-pink"
            isAuthenticated={isAuthenticated}
            loading={loadingTrips}
            error={tripError}
            trips={tripOptions}
            onSignIn={() => signInWithGoogle()}
            onSelect={(tripId) => router.push(`/dashboard?tripId=${tripId}&view=calendar`)}
          />
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {manifestoCards.map((card) => (
            <article key={card.title} className="rounded-lg border-2 border-dayglo-void bg-white p-5 shadow-hard">
              <h3 className="text-xl font-black uppercase text-dayglo-void">{card.title}</h3>
              <p className="data-mono mt-3 text-sm text-dayglo-void">{card.body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function ActionCard({
  label,
  subtext,
  accent,
  onClick,
}: {
  label: string;
  subtext: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col justify-between rounded-lg border-2 border-dayglo-void bg-paper p-5 text-left shadow-hard transition hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#050505]"
    >
      <span className={`inline-flex w-fit rounded-md border-2 border-dayglo-void px-3 py-1 text-xs font-black uppercase tracking-[0.3em] text-dayglo-void ${accent}`}>
        {label}
      </span>
      <p className="data-mono mt-4 text-sm text-dayglo-void">{subtext}</p>
    </button>
  );
}

function JumpBackCard({
  label,
  subtext,
  accent,
  isAuthenticated,
  loading,
  error,
  trips,
  onSignIn,
  onSelect,
}: {
  label: string;
  subtext: string;
  accent: string;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  trips: Array<{ id: string; title: string }>;
  onSignIn: () => Promise<void> | void;
  onSelect: (tripId: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!selected && trips.length) {
      setSelected(trips[0].id);
    }
  }, [selected, trips]);

  const readyToNavigate = Boolean(selected);

  return (
    <div className="flex h-full flex-col rounded-lg border-2 border-dayglo-void bg-paper p-5 shadow-hard">
      <div className="flex flex-col gap-2">
        <span className={`inline-flex w-fit rounded-md border-2 border-dayglo-void px-3 py-1 text-xs font-black uppercase tracking-[0.3em] text-dayglo-void ${accent}`}>
          {label}
        </span>
        <p className="data-mono text-sm text-dayglo-void">{subtext}</p>
      </div>
      <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
          >
            Sign in to choose a trip
          </button>
        ) : loading ? (
          <p className="text-sm font-semibold text-dayglo-void">Loading your trips...</p>
        ) : trips.length ? (
          <>
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
            >
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => readyToNavigate && onSelect(selected)}
              disabled={!readyToNavigate}
              className="rounded-md border-2 border-dayglo-void bg-dayglo-pink px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed"
            >
              Go
            </button>
          </>
        ) : (
          <p className="text-sm font-semibold text-dayglo-void">No trips yet. Start one to see it here.</p>
        )}
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </div>
    </div>
  );
}
