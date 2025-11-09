"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

interface TripDay {
  id: string;
  date: string;
  city: string;
  notes?: string | null;
}

interface Trip {
  id: string;
  title: string;
  description?: string | null;
  homeCity?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days: TripDay[];
  createdAt: string;
}

interface TripsResponse {
  trips: Trip[];
  user?: {
    id: string;
    email: string;
    displayName?: string | null;
    credits?: number | null;
  };
}

const emptyForm = {
  title: "",
  startDate: "",
  endDate: "",
  homeCity: clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY,
  description: "",
};

const DEMO_STORAGE_KEY = "thetrip-demo-profile";

type DemoProfile = {
  name: string;
  email: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildDemoIdentity(profile: DemoProfile | null) {
  if (!profile) return null;
  const base = profile.name || profile.email;
  if (!base) return null;
  const slug = slugify(base) || Date.now().toString(36);
  const id = slug.startsWith("demo-") ? slug : `demo-${slug}`;
  return {
    id,
    name: profile.name || null,
    email: profile.email || `${id}@demo.thetrip`,
  };
}

export function TripDashboard() {
  const { status, user, idToken, firebaseConfigured, signInWithGoogle, signOut, error } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [formState, setFormState] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [demoProfile, setDemoProfile] = useState<DemoProfile | null>(null);
  const [demoInitialized, setDemoInitialized] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const isAuthenticated = Boolean(user && idToken);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoProfile;
        setDemoProfile(parsed);
      }
    } catch {
      // ignore
    } finally {
      setDemoInitialized(true);
    }
  }, []);

  const demoIdentity = useMemo(() => {
    if (idToken) return null;
    return buildDemoIdentity(demoProfile);
  }, [demoProfile, idToken]);

  const authHeaders = useMemo(() => {
    if (idToken) {
      return { Authorization: `Bearer ${idToken}` };
    }
    if (demoIdentity) {
      return { "X-Trip-Demo-User": JSON.stringify(demoIdentity) };
    }
    return {} as Record<string, string>;
  }, [idToken, demoIdentity]);

  const canAccessTrips = Boolean(idToken || demoIdentity);

  const headline = useMemo(() => {
    if (!canAccessTrips) {
      return firebaseConfigured ? "Sign in to start" : "Add a name to start planning";
    }
    if (!trips.length) {
      return "Create your first trip.";
    }
    return "Your active trips";
  }, [canAccessTrips, firebaseConfigured, trips.length]);

  useEffect(() => {
    if (!idToken && !demoIdentity) {
      setTrips([]);
      return;
    }

    async function fetchTrips() {
      setLoadingTrips(true);
      setTripError(null);
      try {
        const res = await fetch("/api/trips", {
          headers: authHeaders,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to load trips (${res.status})`);
        }
        const data: TripsResponse = await res.json();
        setTrips(data.trips || []);
      } catch (err) {
        setTripError(err instanceof Error ? err.message : "Unknown error loading trips");
      } finally {
        setLoadingTrips(false);
      }
    }

    fetchTrips();
  }, [authHeaders, demoIdentity, idToken]);

  async function handleCreateTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAccessTrips) return;

    setCreating(true);
    setTripError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          title: formState.title,
          description: formState.description || undefined,
          homeCity: formState.homeCity || undefined,
          startDate: formState.startDate || undefined,
          endDate: formState.endDate || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to create trip (${res.status})`);
      }

      setFormState(emptyForm);
      const data = await res.json();
      setTrips((prev) => {
        const next = [data.trip as Trip, ...prev];
        if (!selectedTripId) {
          setSelectedTripId(data.trip.id);
        }
        return next;
      });
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Error creating trip");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!selectedTripId && trips.length) {
      setSelectedTripId(trips[0].id);
    }
  }, [selectedTripId, trips]);

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{clientEnv.NEXT_PUBLIC_APP_NAME}</p>
            <h1 className="text-2xl font-semibold text-white">The Trip Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{user.displayName || "Signed in"}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:border-white/40"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex flex-col items-end gap-2 text-right">
                <button
                  onClick={() => signInWithGoogle().catch((err) => setTripError(err.message))}
                  disabled={!firebaseConfigured || status === "loading"}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-200"
                >
                  {firebaseConfigured ? "Sign in with Google" : "Configure Firebase"}
                </button>
                <p className="text-xs text-slate-500">or use demo profile below</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-4">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Trips</p>
            <h2 className="text-3xl font-semibold text-white">{headline}</h2>
            {tripError && <p className="mt-2 text-sm text-rose-400">{tripError}</p>}
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          </div>

          {!firebaseConfigured && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              No Firebase client config yet. Use the demo profile panel to create trips, or add the
              `NEXT_PUBLIC_FIREBASE_*` env vars later for Google sign-in.
            </div>
          )}

          {canAccessTrips ? (
            <div className="space-y-4">
              {loadingTrips && <p className="text-sm text-slate-400">Loading trips...</p>}
              {!loadingTrips && !trips.length && (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-400">
                  No trips yet. Use the form to the right to create one.
                </div>
              )}
              <div className="grid gap-4">
                {trips.map((trip) => (
                  <article
                    key={trip.id}
                    className={`cursor-pointer rounded-2xl border p-5 transition hover:border-white/40 ${
                      selectedTripId === trip.id ? "border-white/60 bg-white/10" : "border-white/10 bg-white/5"
                    }`}
                    onClick={() => setSelectedTripId(trip.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{trip.title}</h3>
                        <p className="text-sm text-slate-400">{trip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}</p>
                      </div>
                      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">{trip.days.length} days</span>
                    </div>
                    {trip.description && <p className="mt-2 text-sm text-slate-300">{trip.description}</p>}
                    {trip.days.length > 0 && (
                      <div className="mt-4 rounded-xl border border-white/5 bg-slate-900/40 p-4">
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Next stop</p>
                        <p className="text-base font-medium text-white">
                          {trip.days[0].city} • {format(new Date(trip.days[0].date), "MMM d, yyyy")}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-400">
              {!demoInitialized ? "Loading..." : "Enter a demo profile or sign in to get started."}
            </div>
          )}
        </section>

        <aside className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {!isAuthenticated && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Demo profile</p>
                <h3 className="text-lg font-semibold text-white">Plan without signing in</h3>
                <p className="text-sm text-slate-400">Trips are scoped to your name/email and stored in the shared database.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400" htmlFor="demoName">
                    Name
                  </label>
                  <input
                    id="demoName"
                    value={demoProfile?.name || ""}
                    onChange={(e) => {
                      const next = { ...(demoProfile || { name: "", email: "" }), name: e.target.value };
                      setDemoProfile(next);
                      if (typeof window !== "undefined") {
                        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400" htmlFor="demoEmail">
                    Email (optional)
                  </label>
                  <input
                    id="demoEmail"
                    type="email"
                    value={demoProfile?.email || ""}
                    onChange={(e) => {
                      const next = { ...(demoProfile || { name: "", email: "" }), email: e.target.value };
                      setDemoProfile(next);
                      if (typeof window !== "undefined") {
                        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                    placeholder="you@example.com"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  This info only lives in your browser + Render database for demo purposes. Add Firebase whenever you’re
                  ready for real auth.
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">New trip</p>
            <h2 className="text-2xl font-semibold text-white">Blueprint a new adventure</h2>
          </div>
          {canAccessTrips ? (
            <form className="space-y-4" onSubmit={handleCreateTrip}>
              <div>
                <label className="text-sm text-slate-300" htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  required
                  value={formState.title}
                  onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  placeholder="June in France"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300" htmlFor="homeCity">
                  Home city
                </label>
                <input
                  id="homeCity"
                  value={formState.homeCity}
                  onChange={(e) => setFormState((prev) => ({ ...prev, homeCity: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  placeholder="Paris"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-300" htmlFor="startDate">
                    Start date
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    value={formState.startDate}
                    onChange={(e) => setFormState((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300" htmlFor="endDate">
                    End date
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    value={formState.endDate}
                    onChange={(e) => setFormState((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-300" htmlFor="description">
                  Notes
                </label>
                <textarea
                  id="description"
                  value={formState.description}
                  onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  rows={3}
                  placeholder="Anniversary week, focus on Nice + Paris"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-full bg-white py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:bg-slate-200"
              >
                {creating ? "Creating..." : "Create trip"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">Provide a demo profile or sign in above to unlock the trip builder.</p>
          )}

          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Trip details</p>
            {selectedTrip ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedTrip.title}</h3>
                  <p className="text-sm text-slate-400">
                    {selectedTrip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}
                  </p>
                </div>
                <div className="space-y-2">
                  {selectedTrip.days.map((day) => (
                    <div key={day.id} className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                        {format(new Date(day.date), "EEE, MMM d")}
                      </p>
                      <p className="text-sm font-medium text-white">{day.city}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a trip to view its daily cadence.</p>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
