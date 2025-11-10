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

export function TripDashboard() {
  const { status, user, idToken, firebaseConfigured, signInWithGoogle, signOut, error } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [formState, setFormState] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayForm, setDayForm] = useState({ city: "", notes: "" });
  const [daySaving, setDaySaving] = useState(false);
  const isAuthenticated = Boolean(user && idToken);
  const authHeaders = useMemo(() => {
    if (idToken) {
      return { Authorization: `Bearer ${idToken}` };
    }
    return {} as Record<string, string>;
  }, [idToken]);

  const canAccessTrips = isAuthenticated;

  const headline = useMemo(() => {
    if (!canAccessTrips) {
      return firebaseConfigured ? "Sign in to start" : "Configure Firebase";
    }
    if (!trips.length) {
      return "Create your first trip.";
    }
    return "Your active trips";
  }, [canAccessTrips, firebaseConfigured, trips.length]);

  useEffect(() => {
    if (!idToken) {
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
  }, [authHeaders, idToken]);

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
        setSelectedTripId(data.trip.id);
        setSelectedDayId(data.trip.days[0]?.id ?? null);
        return next;
      });
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Error creating trip");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!trips.length) {
      setSelectedTripId(null);
      setSelectedDayId(null);
      return;
    }
    const exists = selectedTripId && trips.some((trip) => trip.id === selectedTripId);
    if (!exists) {
      setSelectedTripId(trips[0].id);
      setSelectedDayId(trips[0].days[0]?.id ?? null);
    }
  }, [selectedTripId, trips]);

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) || null;
  const selectedDay = selectedTrip?.days.find((day) => day.id === selectedDayId) || null;

  useEffect(() => {
    if (!selectedTrip) {
      setSelectedDayId(null);
      setDayForm({ city: "", notes: "" });
      return;
    }
    const exists = selectedTrip.days.some((day) => day.id === selectedDayId);
    if (!exists) {
      setSelectedDayId(selectedTrip.days[0]?.id ?? null);
    }
  }, [selectedTrip, selectedDayId]);

  useEffect(() => {
    if (selectedDay) {
      setDayForm({ city: selectedDay.city, notes: selectedDay.notes || "" });
    } else {
      setDayForm({ city: "", notes: "" });
    }
  }, [selectedDay]);

  async function handleSaveDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip || !selectedDay || !canAccessTrips) return;

    setDaySaving(true);
    setTripError(null);
    try {
      const res = await fetch(`/api/trips/${selectedTrip.id}/days/${selectedDay.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ city: dayForm.city, notes: dayForm.notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to update day (${res.status})`);
      }
      const data = await res.json();
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                days: trip.days.map((day) =>
                  day.id === data.day.id
                    ? { ...day, city: data.day.city, notes: data.day.notes }
                    : day,
                ),
              }
            : trip,
        ),
      );
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to update day");
    } finally {
      setDaySaving(false);
    }
  }

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
              <button
                onClick={() => signInWithGoogle().catch((err) => setTripError(err.message))}
                disabled={!firebaseConfigured || status === "loading"}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                {firebaseConfigured ? "Sign in with Google" : "Configure Firebase"}
              </button>
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
              Firebase client config missing (`NEXT_PUBLIC_FIREBASE_*`). Add it in Render to enable sign in.
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
              {status === "loading" ? "Checking your session..." : "Sign in with Google to load your trips."}
            </div>
          )}
        </section>

        <aside className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
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
            <p className="text-sm text-slate-400">Sign in with Google above to unlock the trip builder.</p>
          )}

          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Trip details</p>
                {selectedTrip ? (
                  <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedTrip.title}</h3>
                  <p className="text-sm text-slate-400">
                    {selectedTrip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}
                  </p>
                </div>
                <div className="space-y-2">
                  {selectedTrip.days.length ? (
                    selectedTrip.days.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => setSelectedDayId(day.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                          selectedDayId === day.id
                            ? "border-white/60 bg-white/10"
                            : "border-white/10 bg-transparent hover:border-white/30"
                        }`}
                      >
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                          {format(new Date(day.date), "EEE, MMM d")}
                        </p>
                        <p className="text-sm font-medium text-white">{day.city}</p>
                        {day.notes && <p className="text-xs text-slate-400">{day.notes}</p>}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Add dates to see day-by-day entries.</p>
                  )}
                </div>

                {selectedDay ? (
                  <form className="space-y-3" onSubmit={handleSaveDay}>
                    <div>
                      <label className="text-xs text-slate-400" htmlFor="dayCity">
                        City
                      </label>
                      <input
                        id="dayCity"
                        value={dayForm.city}
                        onChange={(e) => setDayForm((prev) => ({ ...prev, city: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400" htmlFor="dayNotes">
                        Notes / plans
                      </label>
                      <textarea
                        id="dayNotes"
                        rows={3}
                        value={dayForm.notes}
                        onChange={(e) => setDayForm((prev) => ({ ...prev, notes: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                        placeholder="Morning train to Lyon, dinner at Le Bouchon"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={daySaving}
                      className="w-full rounded-full bg-white py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:bg-slate-200"
                    >
                      {daySaving ? "Saving..." : "Save day"}
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-slate-500">Select a day to edit its city and plans.</p>
                )}
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
