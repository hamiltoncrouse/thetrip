"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

interface Activity {
  id: string;
  title: string;
  description?: string | null;
  startTime?: string | null;
}

interface TripDay {
  id: string;
  date: string;
  city: string;
  notes?: string | null;
  activities?: Activity[];
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
}

const emptyTripForm = {
  title: "",
  startDate: "",
  endDate: "",
  homeCity: clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY,
  description: "",
};

const emptyDayForm = {
  city: "",
  notes: "",
};

const emptyActivityForm = {
  title: "",
  time: "",
  notes: "",
};

export function TripDashboard() {
  const { status, user, idToken, firebaseConfigured, signInWithGoogle, signOut, error } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [tripForm, setTripForm] = useState(emptyTripForm);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayForm, setDayForm] = useState(emptyDayForm);
  const [savingDay, setSavingDay] = useState(false);
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const [savingActivity, setSavingActivity] = useState(false);

  const isAuthenticated = Boolean(user && idToken);
  const authHeaders = useMemo(() => {
    if (!idToken) return undefined;
    return { Authorization: `Bearer ${idToken}` } satisfies HeadersInit;
  }, [idToken]);

  const headline = useMemo(() => {
    if (!isAuthenticated) {
      return firebaseConfigured ? "Sign in to start" : "Configure Firebase";
    }
    if (!trips.length) return "Create your first trip";
    return "Your active trips";
  }, [firebaseConfigured, isAuthenticated, trips.length]);

  useEffect(() => {
    if (!idToken) {
      setTrips([]);
      setSelectedTripId(null);
      setSelectedDayId(null);
      return;
    }

    async function fetchTrips() {
      setLoadingTrips(true);
      setTripError(null);
      try {
        const res = await fetch("/api/trips", { headers: authHeaders });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to load trips (${res.status})`);
        }
        const data: TripsResponse = await res.json();
        setTrips(data.trips || []);
        if (data.trips?.length) {
          setSelectedTripId((prev) => prev || data.trips[0].id);
          setSelectedDayId((prev) => prev || data.trips[0].days[0]?.id || null);
        }
      } catch (err) {
        setTripError(err instanceof Error ? err.message : "Unknown error loading trips");
      } finally {
        setLoadingTrips(false);
      }
    }

    fetchTrips();
  }, [idToken, authHeaders]);

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) || null;
  const selectedDay = selectedTrip?.days.find((day) => day.id === selectedDayId) || null;
  const orderedActivities = (selectedDay?.activities || [])
    .slice()
    .sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aTime - bTime;
    });

  useEffect(() => {
    if (!selectedTrip) {
      setSelectedDayId(null);
      setDayForm(emptyDayForm);
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
      setDayForm(emptyDayForm);
    }
  }, [selectedDay]);

  async function createTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) return;
    setCreatingTrip(true);
    setTripError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          title: tripForm.title,
          description: tripForm.description || undefined,
          homeCity: tripForm.homeCity || undefined,
          startDate: tripForm.startDate || undefined,
          endDate: tripForm.endDate || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to create trip (${res.status})`);
      }
      const data = await res.json();
      setTrips((prev) => [data.trip as Trip, ...prev]);
      setTripForm(emptyTripForm);
      setSelectedTripId(data.trip.id);
      setSelectedDayId(data.trip.days[0]?.id ?? null);
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Error creating trip");
    } finally {
      setCreatingTrip(false);
    }
  }

  async function deleteTrip(tripId: string) {
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to delete trip (${res.status})`);
      }
      setTrips((prev) => prev.filter((trip) => trip.id !== tripId));
      if (selectedTripId === tripId) {
        setSelectedTripId(null);
        setSelectedDayId(null);
      }
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to delete trip");
    }
  }

  async function saveDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip || !selectedDay) return;
    setSavingDay(true);
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
      setSavingDay(false);
    }
  }

  async function createActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip || !selectedDay) return;
    setSavingActivity(true);
    setTripError(null);
    try {
      const res = await fetch(`/api/trips/${selectedTrip.id}/days/${selectedDay.id}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          title: activityForm.title,
          time: activityForm.time,
          notes: activityForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to add activity (${res.status})`);
      }
      const data = await res.json();
      setActivityForm(emptyActivityForm);
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                days: trip.days.map((day) =>
                  day.id === selectedDay.id
                    ? { ...day, activities: [...(day.activities || []), data.activity] }
                    : day,
                ),
              }
            : trip,
        ),
      );
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to add activity");
    } finally {
      setSavingActivity(false);
    }
  }

  return (
    <div className="min-h-screen text-slate-100">
      <header className="border-b border-white/10 bg-[#070016]/80 backdrop-blur">
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
                className="psychedelic-button rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {firebaseConfigured ? "Sign in with Google" : "Configure Firebase"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:flex-row">
        <section className="space-y-4 lg:w-[320px]">
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

          {isAuthenticated ? (
            <div className="space-y-4">
              {loadingTrips && <p className="text-sm text-slate-400">Loading trips...</p>}
              {!loadingTrips && !trips.length && (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-400">
                  No trips yet. Use the form below to create one.
                </div>
              )}
              <div className="grid gap-4">
                {trips.map((trip) => (
                  <article
                    key={trip.id}
                    className={`cursor-pointer rounded-2xl border p-5 transition hover:border-white/40 ${
                      selectedTripId === trip.id ? "border-white/70 bg-white/15" : "border-white/10 bg-white/5"
                    }`}
                    onClick={() => {
                      setSelectedTripId(trip.id);
                      setSelectedDayId(trip.days[0]?.id ?? null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{trip.title}</h3>
                        <p className="text-sm text-slate-400">{trip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                        <span>{trip.days.length} days</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete trip "${trip.title}"?`)) {
                              deleteTrip(trip.id);
                            }
                          }}
                          className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white transition hover:border-white/50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {trip.description && <p className="mt-2 text-sm text-slate-300">{trip.description}</p>}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-slate-400">
              {status === "loading" ? "Checking your session..." : "Sign in with Google to load your trips."}
            </div>
          )}

          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">New trip</p>
            <h2 className="text-2xl font-semibold text-white">Blueprint a new adventure</h2>
          </div>
          {isAuthenticated ? (
            <form className="space-y-4" onSubmit={createTrip}>
              <div>
                <label className="text-sm text-slate-300" htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  required
                  value={tripForm.title}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, title: e.target.value }))}
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
                  value={tripForm.homeCity}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, homeCity: e.target.value }))}
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
                    value={tripForm.startDate}
                    onChange={(e) => setTripForm((prev) => ({ ...prev, startDate: e.target.value }))}
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
                    value={tripForm.endDate}
                    onChange={(e) => setTripForm((prev) => ({ ...prev, endDate: e.target.value }))}
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
                  value={tripForm.description}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  rows={3}
                  placeholder="Anniversary week, focus on Nice + Paris"
                />
              </div>
              <button
                type="submit"
                disabled={creatingTrip}
                className="psychedelic-button w-full rounded-full py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
              >
                {creatingTrip ? "Creating..." : "Create trip"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">Sign in with Google above to unlock the trip builder.</p>
          )}
        </section>

        <section className="flex-1 space-y-4">
          {selectedTrip ? (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Current trip</p>
                  <h2 className="text-2xl font-semibold text-white">{selectedTrip.title}</h2>
                  <p className="text-sm text-slate-400">
                    {selectedTrip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}
                  </p>
                </div>
                <div className="flex max-w-full gap-2 overflow-x-auto rounded-full bg-white/5 px-2 py-1 text-xs">
                  {selectedTrip.days.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedDayId(day.id)}
                      className={`rounded-full px-3 py-1 transition ${
                        selectedDayId === day.id
                          ? "bg-white text-slate-900"
                          : "bg-transparent text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      {format(new Date(day.date), "MMM d")}
                    </button>
                  ))}
                </div>
              </div>

              {selectedDay ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Day overview</p>
                    <h3 className="text-xl font-semibold text-white">
                      {format(new Date(selectedDay.date), "EEEE, MMMM d")}
                    </h3>
                  </div>

                  <form className="grid gap-4 md:grid-cols-2" onSubmit={saveDay}>
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
                        placeholder="Morning in Le Marais, train to Nice at 5 PM"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingDay}
                      className="psychedelic-button rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                    >
                      {savingDay ? "Saving..." : "Save day"}
                    </button>
                  </form>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Timeline</p>
                      {orderedActivities.length ? (
                        <ol className="space-y-3">
                          {orderedActivities.map((activity) => (
                            <li
                              key={activity.id}
                              className="rounded-2xl border border-white/10 bg-slate-900/30 px-4 py-3"
                            >
                              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                                {activity.startTime
                                  ? format(new Date(activity.startTime), "HH:mm")
                                  : "--:--"}
                              </p>
                              <p className="text-sm font-semibold text-white">{activity.title}</p>
                              {activity.description && (
                                <p className="text-xs text-slate-400">{activity.description}</p>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-slate-400">No scheduled items yet.</p>
                      )}
                    </div>

                    <form className="grid gap-3 md:grid-cols-[120px_1fr]" onSubmit={createActivity}>
                      <div>
                        <label className="text-xs text-slate-400" htmlFor="activityTime">
                          Time
                        </label>
                        <input
                          id="activityTime"
                          type="time"
                          required
                          value={activityForm.time}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, time: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="text-xs text-slate-400" htmlFor="activityTitle">
                          Activity
                        </label>
                        <input
                          id="activityTitle"
                          required
                          value={activityForm.title}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, title: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                          placeholder="Sunset at Pont Neuf"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <textarea
                          placeholder="Optional notes"
                          value={activityForm.notes}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, notes: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                          rows={2}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingActivity}
                        className="psychedelic-button rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 md:col-span-2"
                      >
                        {savingActivity ? "Adding..." : "Add to timeline"}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Select a day to edit it.</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-400">
              Select or create a trip to start planning.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
