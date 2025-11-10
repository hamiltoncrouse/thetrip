"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

type Activity = {
  id: string;
  title: string;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

type TripDay = {
  id: string;
  date: string;
  city: string;
  notes?: string | null;
  activities?: Activity[];
};

type Trip = {
  id: string;
  title: string;
  description?: string | null;
  homeCity?: string | null;
  days: TripDay[];
};

type TripsResponse = {
  trips: Trip[];
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const randomId = () => Math.random().toString(36).slice(2, 11);

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
  startTime: "",
  endTime: "",
  notes: "",
};

const initialChat: ChatMessage[] = [
  {
    id: "intro",
    role: "assistant",
    text: "Hey, I’m Fonda — your neon-loving travel consultant. Ask me for riffs on routes, timing tweaks, or secret detours whenever you need a spark.",
  },
];

const formatTime = (iso?: string | null) => {
  if (!iso) return "--:--";
  const date = new Date(iso);
  // Use the stored UTC time so wall-clock values match the inputs regardless of viewer timezone
  return date.toISOString().slice(11, 16);
};
const formatTimeRange = (activity: Activity) => {
  const start = formatTime(activity.startTime);
  const end = activity.endTime ? formatTime(activity.endTime) : null;
  return end ? `${start} – ${end}` : start;
};

export function TripDashboard() {
  const { status, user, idToken, firebaseConfigured, signInWithGoogle, signOut, error } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [tripForm, setTripForm] = useState(emptyTripForm);
  const [showTripForm, setShowTripForm] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayForm, setDayForm] = useState(emptyDayForm);
  const [savingDay, setSavingDay] = useState(false);
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [savingActivity, setSavingActivity] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChat);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const isAuthenticated = Boolean(user && idToken);
  const authHeaders = useMemo(() => {
    if (!idToken) return undefined;
    return { Authorization: `Bearer ${idToken}` } satisfies HeadersInit;
  }, [idToken]);

  const jsonHeaders = useMemo(() => {
    const base: Record<string, string> = { "Content-Type": "application/json" };
    if (idToken) base.Authorization = `Bearer ${idToken}`;
    return base;
  }, [idToken]);

  const headline = useMemo(() => {
    if (!isAuthenticated) return firebaseConfigured ? "Sign in to start" : "Configure Firebase";
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
      setEditingActivityId(null);
      setActivityForm(emptyActivityForm);
    } else {
      setDayForm(emptyDayForm);
    }
  }, [selectedDay]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) {
      setIsChatOpen(true);
    }
  }, []);

  async function createTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) return;
    setCreatingTrip(true);
    setTripError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: jsonHeaders,
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
      setShowTripForm(false);
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
        headers: jsonHeaders,
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

  async function saveActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip || !selectedDay || !activityForm.title || !activityForm.startTime) return;
    setSavingActivity(true);
    setTripError(null);
    const payload = {
      title: activityForm.title,
      startTime: activityForm.startTime,
      endTime: activityForm.endTime || undefined,
      notes: activityForm.notes || undefined,
    };

    try {
      const endpoint = editingActivityId
        ? `/api/trips/${selectedTrip.id}/days/${selectedDay.id}/activities/${editingActivityId}`
        : `/api/trips/${selectedTrip.id}/days/${selectedDay.id}/activities`;
      const res = await fetch(endpoint, {
        method: editingActivityId ? "PATCH" : "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to save activity (${res.status})`);
      }
      const data = await res.json();
      setActivityForm(emptyActivityForm);
      setEditingActivityId(null);
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                days: trip.days.map((day) =>
                  day.id === selectedDay.id
                    ? {
                        ...day,
                        activities: editingActivityId
                          ? day.activities?.map((activity) =>
                              activity.id === data.activity.id ? data.activity : activity,
                            )
                          : [...(day.activities || []), data.activity],
                      }
                    : day,
                ),
              }
            : trip,
        ),
      );
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to save activity");
    } finally {
      setSavingActivity(false);
    }
  }

  async function deleteActivity(activityId: string) {
    if (!selectedTrip || !selectedDay) return;
    try {
      const res = await fetch(
        `/api/trips/${selectedTrip.id}/days/${selectedDay.id}/activities/${activityId}`,
        {
          method: "DELETE",
          headers: authHeaders,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to delete activity (${res.status})`);
      }
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                days: trip.days.map((day) =>
                  day.id === selectedDay.id
                    ? {
                        ...day,
                        activities: (day.activities || []).filter((activity) => activity.id !== activityId),
                      }
                    : day,
                ),
              }
            : trip,
        ),
      );
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to delete activity");
    }
  }

  function handleEditActivity(activity: Activity) {
    setEditingActivityId(activity.id);
    setActivityForm({
      title: activity.title,
      startTime: activity.startTime ? format(new Date(activity.startTime), "HH:mm") : "",
      endTime: activity.endTime ? format(new Date(activity.endTime), "HH:mm") : "",
      notes: activity.description || "",
    });
  }

  function cancelActivityEdit() {
    setEditingActivityId(null);
    setActivityForm(emptyActivityForm);
  }

  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatInput.trim() || !isAuthenticated) return;
    const trimmed = chatInput.trim();
    setChatMessages((prev) => [...prev, { id: randomId(), role: "user", text: trimmed }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeaders ?? {}),
        },
        body: JSON.stringify({
          city: selectedDay?.city || selectedTrip?.homeCity || "your current locale",
          day: selectedDay?.date,
          interests: [trimmed],
        }),
      });
      const data = await res.json().catch(() => ({}));
      const items: Array<{ title?: string; description?: string }> = data.items || [];
      const response =
        items.length > 0
          ? `Here’s a thread to pull:\n${items
              .map((item) => `• ${item.title || "Idea"}: ${item.description || "Give it a whirl."}`)
              .join("\n")}`
          : data.error || "Couldn’t reach my data sources, but I’ll keep watching the map for ideas.";
      setChatMessages((prev) => [...prev, { id: randomId(), role: "assistant", text: response }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: randomId(),
          role: "assistant",
          text: err instanceof Error ? err.message : "Fonda hit a snag reaching the APIs. Try again in a beat.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  const chatPanelContent = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Fonda</p>
          <h2 className="text-xl font-semibold text-white">Travel consultant</h2>
        </div>
        <div className="flex items-center gap-2">
          {chatLoading && <span className="text-xs text-slate-300">thinking...</span>}
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white transition hover:border-white lg:hidden"
          >
            Close
          </button>
        </div>
      </div>
      <div
        className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/30 p-4 text-sm"
        style={{ minHeight: "320px" }}
      >
        {chatMessages.map((message) => (
          <div
            key={message.id}
            className={`max-w-full rounded-2xl px-4 py-2 ${
              message.role === "assistant"
                ? "bg-white/10 text-slate-100 self-start"
                : "bg-white text-slate-900 self-end"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>
      <form className="space-y-2 pt-2" onSubmit={sendChatMessage}>
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={!isAuthenticated}
          className="w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white outline-none focus:border-white/40 disabled:opacity-50"
          rows={3}
          placeholder={
            isAuthenticated
              ? "Ask Fonda for restaurant ideas, better routing, or vibe-matched suggestions."
              : "Sign in to chat with Fonda."
          }
        />
        <button
          type="submit"
          disabled={!isAuthenticated || chatLoading || !chatInput.trim()}
          className="psychedelic-button w-full rounded-full py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send to Fonda
        </button>
      </form>
    </>
  );

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

      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{headline}</p>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="min-w-[220px] rounded-2xl border border-white/20 bg-slate-900/40 px-4 py-2 text-sm text-white outline-none focus:border-white"
                  value={selectedTripId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    setSelectedTripId(value);
                    const trip = trips.find((t) => t.id === value);
                    setSelectedDayId(trip?.days[0]?.id ?? null);
                  }}
                  disabled={!trips.length}
                >
                  {!trips.length && <option value="">No trips yet</option>}
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowTripForm((prev) => !prev)}
                  className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:border-white"
                >
                  {showTripForm ? "Close form" : "New trip"}
                </button>
                {selectedTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete trip "${selectedTrip.title}"?`)) {
                        deleteTrip(selectedTrip.id);
                      }
                    }}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-rose-200 transition hover:border-rose-200"
                  >
                    Delete trip
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsChatOpen((prev) => !prev)}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:border-white/50"
                >
                  {isChatOpen ? "Hide Fonda" : "Open Fonda"}
                </button>
              </div>
            </div>
            <div className="text-sm text-slate-300 lg:max-w-md">
              {loadingTrips && <p className="text-xs text-slate-400">Loading trips...</p>}
              {tripError && <p className="text-rose-400">{tripError}</p>}
              {error && <p className="text-rose-400">{error}</p>}
              {!tripError && !error && (
                <p>
                  {selectedTrip
                    ? selectedTrip.description || "No trip description yet."
                    : isAuthenticated
                    ? "Create or select a trip to start planning."
                    : status === "loading"
                    ? "Checking your session..."
                    : "Sign in with Google to load your trips."}
                </p>
              )}
            </div>
          </div>

          {selectedTrip && selectedTrip.days.length > 0 && (
            <div className="flex gap-2 overflow-x-auto rounded-full bg-white/5 px-3 py-2 text-xs">
              {selectedTrip.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayId(day.id)}
                  className={`rounded-full px-4 py-1 transition ${
                    selectedDayId === day.id
                      ? "bg-white text-slate-900"
                      : "bg-transparent text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {format(new Date(day.date), "MMM d")}
                </button>
              ))}
            </div>
          )}

          {showTripForm && (
            <form className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4" onSubmit={createTrip}>
              <div className="sm:col-span-2">
                <label className="text-sm text-slate-300" htmlFor="title">
                  Trip title
                </label>
                <input
                  id="title"
                  required
                  value={tripForm.title}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  placeholder="Neon Riviera"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300" htmlFor="homeCity">
                  Base city
                </label>
                <input
                  id="homeCity"
                  value={tripForm.homeCity}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, homeCity: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  placeholder="Lisbon"
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
              <div className="sm:col-span-2">
                <label className="text-sm text-slate-300" htmlFor="description">
                  Notes / intent
                </label>
                <textarea
                  id="description"
                  value={tripForm.description}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  rows={3}
                  placeholder="Anniversary loop, mix rooftop bars with train rides"
                />
              </div>
              <button
                type="submit"
                disabled={creatingTrip}
                className="psychedelic-button w-full rounded-full py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
              >
                {creatingTrip ? "Creating..." : "Create trip"}
              </button>
            </form>
          )}
        </section>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr),360px]">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            {selectedTrip ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Current trip</p>
                  <h2 className="text-2xl font-semibold text-white">{selectedTrip.title}</h2>
                  <p className="text-sm text-slate-400">
                    {selectedTrip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}
                  </p>
                </div>

                {selectedDay ? (
                  <div className="space-y-5">
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
                        placeholder="Morning wander, afternoon train, late dinner"
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
                        <ol className="space-y-2">
                          {orderedActivities.map((activity) => (
                            <li
                              key={activity.id}
                              className="rounded-2xl border border-white/10 bg-slate-900/30 px-4 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                                    {formatTimeRange(activity)}
                                  </p>
                                  <p className="text-sm font-semibold text-white">{activity.title}</p>
                                  {activity.description && (
                                    <p className="text-xs text-slate-400">{activity.description}</p>
                                  )}
                                </div>
                                <div className="flex gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                                  <button
                                    type="button"
                                    onClick={() => handleEditActivity(activity)}
                                    className="rounded-full border border-white/30 px-2 py-0.5 hover:border-white"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteActivity(activity.id)}
                                    className="rounded-full border border-white/30 px-2 py-0.5 text-rose-200 hover:border-rose-200"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-slate-400">No scheduled items yet.</p>
                      )}
                    </div>

                    <form className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/30 p-3" onSubmit={saveActivity}>
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                        {editingActivityId ? "Edit activity" : "Add activity"}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-slate-400" htmlFor="startTime">
                            Start
                          </label>
                          <input
                            id="startTime"
                            type="time"
                            required
                            value={activityForm.startTime}
                            onChange={(e) => setActivityForm((prev) => ({ ...prev, startTime: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400" htmlFor="endTime">
                            End (optional)
                          </label>
                          <input
                            id="endTime"
                            type="time"
                            value={activityForm.endTime}
                            onChange={(e) => setActivityForm((prev) => ({ ...prev, endTime: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400" htmlFor="activityTitle">
                          Title
                        </label>
                        <input
                          id="activityTitle"
                          required
                          value={activityForm.title}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, title: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                          placeholder="Midnight rooftop bar"
                        />
                      </div>
                      <div>
                        <textarea
                          placeholder="Optional notes"
                          value={activityForm.notes}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, notes: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                          rows={2}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={savingActivity}
                          className="psychedelic-button rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                        >
                          {savingActivity
                            ? "Saving..."
                            : editingActivityId
                            ? "Update activity"
                            : "Add to timeline"}
                        </button>
                        {editingActivityId && (
                          <button
                            type="button"
                            onClick={cancelActivityEdit}
                            className="rounded-full border border-white/30 px-4 py-2 text-sm text-white transition hover:border-white"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
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

        <div className="hidden lg:flex">
          {isChatOpen ? (
            <div className="flex h-full flex-col space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
              {chatPanelContent}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-slate-300">
              <p className="text-sm">Need ideas or timing help?</p>
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="psychedelic-button rounded-full px-4 py-2 text-sm font-semibold"
              >
                Chat with Fonda
              </button>
            </div>
          )}
        </div>

        </div>

        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setIsChatOpen(true)}
            className="psychedelic-button w-full rounded-full py-3 text-sm font-semibold"
          >
            {isChatOpen ? "Fonda is open" : "Chat with Fonda"}
          </button>
        </div>

        {isChatOpen && (
          <div className="fixed inset-0 z-40 bg-black/70 px-4 py-6 lg:hidden">
            <div className="mx-auto flex h-full max-w-md flex-col space-y-4 rounded-2xl border border-white/10 bg-[#050112] p-5">
              {chatPanelContent}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
