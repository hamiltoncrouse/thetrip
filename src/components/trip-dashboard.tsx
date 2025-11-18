"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

type Activity = {
  id: string;
  title: string;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  startLocation?: string | null;
  travelDistanceMeters?: number | null;
  travelDurationSeconds?: number | null;
  travelSummary?: string | null;
  travelPolyline?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

type HotelActivityMetadata = {
  kind?: string;
  hotelId?: string;
  nights?: number;
  price?: number;
  currency?: string;
  distanceKm?: number;
  reviewScore?: number;
  offer?: string;
  address?: string;
  description?: string;
};

type TripDay = {
  id: string;
  date: string;
  city: string;
  cityPlaceId?: string | null;
  cityLatitude?: number | null;
  cityLongitude?: number | null;
  notes?: string | null;
  activities?: Activity[];
};

type PlaceSuggestion = {
  placeId: string;
  description: string;
  primary: string;
  secondary?: string;
};

type DayPlaceLookup = Record<
  string,
  {
    placeId?: string | null;
    description: string;
    lat: number;
    lng: number;
  }
>;

type Trip = {
  id: string;
  title: string;
  description?: string | null;
  homeCity?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days: TripDay[];
  collaborators?: Array<{ id: string; email: string }>;
};

type TripsResponse = {
  trips: Trip[];
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type HotelOption = {
  id: string;
  name: string;
  address?: string;
  distanceKm?: number;
  price?: number;
  currency?: string;
  description?: string;
  offer?: string;
  reviewScore?: number;
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
  location: "",
  startLocation: "",
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

const getHotelMetadata = (activity: Activity): HotelActivityMetadata | null => {
  if (activity.type !== "hotel") return null;
  const meta = (activity.metadata || {}) as Record<string, unknown>;
  const nights = typeof meta.nights === "number" && meta.nights > 0 ? meta.nights : undefined;
  const price = typeof meta.price === "number" ? meta.price : undefined;
  const distanceKm = typeof meta.distanceKm === "number" ? meta.distanceKm : undefined;
  const reviewScore = typeof meta.reviewScore === "number" ? meta.reviewScore : undefined;
  return {
    kind: typeof meta.kind === "string" ? meta.kind : undefined,
    hotelId: typeof meta.hotelId === "string" ? meta.hotelId : undefined,
    nights,
    price,
    currency: typeof meta.currency === "string" ? meta.currency : undefined,
    distanceKm,
    reviewScore,
    offer: typeof meta.offer === "string" ? meta.offer : undefined,
    address: typeof meta.address === "string" ? meta.address : undefined,
    description: typeof meta.description === "string" ? meta.description : undefined,
  };
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
  const [chatExpanded, setChatExpanded] = useState(false);
  const [hotelResults, setHotelResults] = useState<HotelOption[]>([]);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [hotelFilters, setHotelFilters] = useState({ minRating: 0, maxDistance: 0, maxPrice: 0 });
  const [hotelPage, setHotelPage] = useState(1);
  const [hasMoreHotels, setHasMoreHotels] = useState(true);
  const [hotelSort, setHotelSort] = useState<"price" | "rating" | "distance" | "none">("none");
  const [isHotelActivity, setIsHotelActivity] = useState(false);
  const [hotelStayNights, setHotelStayNights] = useState(1);
  const [hotelNights, setHotelNights] = useState(1);
  const [addingHotelId, setAddingHotelId] = useState<string | null>(null);
  const [hotelPlanError, setHotelPlanError] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [titleSuggestEnabled, setTitleSuggestEnabled] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<PlaceSuggestion[]>([]);
  const [titleSuggestionsLoading, setTitleSuggestionsLoading] = useState(false);
  const [titleSuggestionsError, setTitleSuggestionsError] = useState<string | null>(null);
  const titleSuggestionsAbortRef = useRef<AbortController | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<PlaceSuggestion[]>([]);
  const [citySuggestionsLoading, setCitySuggestionsLoading] = useState(false);
  const [citySuggestionsError, setCitySuggestionsError] = useState<string | null>(null);
  const [cityDetailsLoading, setCityDetailsLoading] = useState(false);
  const [dayPlaces, setDayPlaces] = useState<DayPlaceLookup>({});
  const [mapError, setMapError] = useState(false);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const suppressSuggestionsRef = useRef(false);
  const createPlacesToken = () =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
  const [placesSessionToken, setPlacesSessionToken] = useState<string>(createPlacesToken);
  const [view, setView] = useState<"timeline" | "calendar">("timeline");
  const [calendarDayId, setCalendarDayId] = useState<string | null>(null);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);

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
        const placeEntries: DayPlaceLookup = {};
        data.trips?.forEach((trip) => {
          trip.days.forEach((day) => {
            if (
              day.cityLatitude !== null &&
              day.cityLatitude !== undefined &&
              day.cityLongitude !== null &&
              day.cityLongitude !== undefined
            ) {
              placeEntries[day.id] = {
                placeId: day.cityPlaceId ?? undefined,
                description: day.city,
                lat: day.cityLatitude,
                lng: day.cityLongitude,
              };
            }
          });
        });
        setDayPlaces(placeEntries);
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
  const hotelActivities = orderedActivities.filter((activity) => activity.type === "hotel");
  const calendarDay = selectedTrip?.days.find((day) => day.id === calendarDayId) || null;
  const calendarEvent = calendarDay?.activities?.find((activity) => activity.id === calendarEventId) || null;
  const calendarHotels = calendarDay?.activities?.filter((activity) => activity.type === "hotel") || [];
  const calendarEventHotel = calendarEvent ? getHotelMetadata(calendarEvent) : null;

  const dayByDateKey = useMemo(() => {
    const map: Record<string, TripDay> = {};
    selectedTrip?.days.forEach((day) => {
      const key = format(new Date(day.date), "yyyy-MM-dd");
      map[key] = day;
    });
    return map;
  }, [selectedTrip]);

  const calendarWeeks = useMemo(() => {
    if (!selectedTrip || !selectedTrip.days.length) return [];
    const sortedDays = [...selectedTrip.days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const startDate = selectedTrip.startDate ? new Date(selectedTrip.startDate) : new Date(sortedDays[0].date);
    const endDate = selectedTrip.endDate
      ? new Date(selectedTrip.endDate)
      : new Date(sortedDays[sortedDays.length - 1].date);
    const start = startOfWeek(startDate, { weekStartsOn: 0 });
    const end = endOfWeek(endDate, { weekStartsOn: 0 });

    const days: Date[] = [];
    let cursor = start;
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    const weeks: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      weeks.push(days.slice(index, index + 7));
    }
    return weeks;
  }, [selectedTrip]);
  const selectedDayPlace = selectedDayId ? dayPlaces[selectedDayId] : null;

  useEffect(() => {
    setMapError(false);
  }, [selectedDayPlace?.placeId, selectedDayPlace?.lat, selectedDayPlace?.lng]);

  useEffect(() => {
    if (!selectedTrip) {
      setSelectedDayId(null);
      setDayForm(emptyDayForm);
      setCityQuery("");
      setCalendarDayId(null);
      setCalendarEventId(null);
      return;
    }
    const exists = selectedTrip.days.some((day) => day.id === selectedDayId);
    if (!exists) {
      setSelectedDayId(selectedTrip.days[0]?.id ?? null);
    }
    if (selectedTrip.days.length) {
      setCalendarDayId((prev) => {
        if (prev && selectedTrip.days.some((day) => day.id === prev)) return prev;
        return selectedTrip.days[0].id;
      });
    } else {
      setCalendarDayId(null);
    }
  }, [selectedTrip, selectedDayId]);

  useEffect(() => {
    if (selectedDay) {
      setDayForm({ city: selectedDay.city, notes: selectedDay.notes || "" });
      setEditingActivityId(null);
      setActivityForm(emptyActivityForm);
      setIsHotelActivity(false);
      setHotelStayNights(1);
      setCityQuery(dayPlaces[selectedDay.id]?.description || selectedDay.city || "");
      setHotelResults([]);
      setHotelError(null);
    } else {
      setDayForm(emptyDayForm);
      setCityQuery("");
      setHotelResults([]);
      setHotelError(null);
    }
  }, [selectedDay, dayPlaces]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) {
      setIsChatOpen(true);
    }
  }, []);

  useEffect(() => {
    if (view === "calendar" && selectedTrip?.days.length) {
      setCalendarDayId((prev) => prev ?? selectedTrip.days[0].id);
    }
  }, [view, selectedTrip]);

  useEffect(() => {
    if (view === "timeline" && selectedDayId) {
      setCalendarDayId(selectedDayId);
    }
  }, [selectedDayId, view]);

  useEffect(() => {
    if (!calendarDayId) {
      setCalendarEventId(null);
      return;
    }
    const day = selectedTrip?.days.find((entry) => entry.id === calendarDayId);
    if (!day) {
      setCalendarEventId(null);
      return;
    }
    setCalendarEventId((prev) => {
      if (prev && day.activities?.some((activity) => activity.id === prev)) return prev;
      return day.activities?.[0]?.id ?? null;
    });
  }, [calendarDayId, selectedTrip]);

  useEffect(() => {
    if (suppressSuggestionsRef.current) {
      setCitySuggestions([]);
      setCitySuggestionsError(null);
      return;
    }

    if (!cityQuery || cityQuery.length < 2) {
      setCitySuggestions([]);
      setCitySuggestionsError(null);
      return;
    }

    if (selectedDayPlace && cityQuery.trim() === selectedDayPlace.description.trim()) {
      setCitySuggestions([]);
      setCitySuggestionsError(null);
      return;
    }

    const handler = setTimeout(async () => {
      try {
        suggestionsAbortRef.current?.abort();
        const controller = new AbortController();
        suggestionsAbortRef.current = controller;
        setCitySuggestionsLoading(true);
        setCitySuggestionsError(null);
        const params = new URLSearchParams({ query: cityQuery });
        if (placesSessionToken) params.set("sessionToken", placesSessionToken);
        const response = await fetch(`/api/maps/autocomplete?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || "Autocomplete failed");
        }
        const data = await response.json();
        setCitySuggestions(data.predictions || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("Autocomplete error", err);
        setCitySuggestionsError(err instanceof Error ? err.message : "Autocomplete failed");
      } finally {
        setCitySuggestionsLoading(false);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [cityQuery, placesSessionToken, selectedDayPlace]);

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
      const place = selectedDayId ? dayPlaces[selectedDayId] : undefined;
      const submittedCity = (cityQuery || dayForm.city).trim();
      setDayForm((prev) => ({ ...prev, city: submittedCity }));
      const res = await fetch(`/api/trips/${selectedTrip.id}/days/${selectedDay.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          city: submittedCity,
          notes: dayForm.notes,
          cityPlaceId: place ? place.placeId ?? null : undefined,
          cityLatitude: place ? place.lat : undefined,
          cityLongitude: place ? place.lng : undefined,
        }),
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
                    ? {
                        ...day,
                        city: data.day.city,
                        notes: data.day.notes,
                        cityPlaceId: data.day.cityPlaceId,
                        cityLatitude: data.day.cityLatitude,
                        cityLongitude: data.day.cityLongitude,
                      }
                    : day,
                ),
              }
            : trip,
        ),
      );
      setDayPlaces((prev) => {
        const next = { ...prev };
        if (data.day.cityLatitude !== null && data.day.cityLatitude !== undefined && data.day.cityLongitude !== null && data.day.cityLongitude !== undefined) {
          next[data.day.id] = {
            placeId: data.day.cityPlaceId,
            description: data.day.city,
            lat: data.day.cityLatitude,
            lng: data.day.cityLongitude,
          };
        } else {
          delete next[data.day.id];
        }
        return next;
      });
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to update day");
    } finally {
      setSavingDay(false);
    }
  }

  async function saveActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip || !selectedDay || !activityForm.title || !activityForm.startTime) {
      setTripError("Title and start time are required to save an activity.");
      return;
    }
    setSavingActivity(true);
    setTripError(null);
    const payload = {
      title: activityForm.title,
      startTime: activityForm.startTime,
      endTime: activityForm.endTime || undefined,
      notes: activityForm.notes || undefined,
      location: activityForm.location || undefined,
      startLocation: activityForm.startLocation || undefined,
      type: isHotelActivity ? "hotel" : undefined,
      metadata: isHotelActivity ? { kind: "hotel", nights: hotelStayNights } : undefined,
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
      setIsHotelActivity(false);
      setHotelStayNights(1);
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
    const hotelMeta = getHotelMetadata(activity);
    setActivityForm({
      title: activity.title,
      startTime: activity.startTime ? formatTime(activity.startTime) : "",
      endTime: activity.endTime ? formatTime(activity.endTime) : "",
      notes: activity.description || "",
      location: activity.location || "",
      startLocation: activity.startLocation || "",
    });
    setIsHotelActivity(Boolean(hotelMeta));
    setHotelStayNights(hotelMeta?.nights && hotelMeta.nights > 0 ? hotelMeta.nights : 1);
  }

  function cancelActivityEdit() {
    setEditingActivityId(null);
    setActivityForm(emptyActivityForm);
    setIsHotelActivity(false);
    setHotelStayNights(1);
  }

  const filteredHotels = useMemo(
    () => applyHotelFilters(hotelResults, hotelFilters, hotelSort),
    [hotelResults, hotelFilters, hotelSort],
  );

  useEffect(() => {
    if (!titleSuggestEnabled) {
      setTitleSuggestions([]);
      setTitleSuggestionsError(null);
      return;
    }
    if (!activityForm.title || activityForm.title.trim().length < 2) {
      setTitleSuggestions([]);
      setTitleSuggestionsError(null);
      return;
    }

    const handler = setTimeout(async () => {
      try {
        titleSuggestionsAbortRef.current?.abort();
        const controller = new AbortController();
        titleSuggestionsAbortRef.current = controller;
        setTitleSuggestionsLoading(true);
        setTitleSuggestionsError(null);
        const params = new URLSearchParams({ query: activityForm.title, types: "establishment" });
        if (selectedDayPlace) {
          params.set("locationbias", `point:${selectedDayPlace.lat},${selectedDayPlace.lng}`);
        }
        const response = await fetch(`/api/maps/autocomplete?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || "Autocomplete failed");
        }
        const data = await response.json();
        setTitleSuggestions(data.predictions || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setTitleSuggestionsError(err instanceof Error ? err.message : "Autocomplete failed");
      } finally {
        setTitleSuggestionsLoading(false);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [activityForm.title, titleSuggestEnabled, selectedDayPlace]);

  async function loadHotelsNearDay(page = 1, append = false) {
    if (!selectedDay || !selectedDayPlace) return;
    if (!authHeaders) {
      setHotelError("Sign in to fetch hotels.");
      return;
    }
    setHotelLoading(true);
    setHotelError(null);
    try {
      const checkIn = format(new Date(selectedDay.date), "yyyy-MM-dd");
      const checkOut = format(addDays(new Date(selectedDay.date), 1), "yyyy-MM-dd");
      const params = new URLSearchParams({
        lat: String(selectedDayPlace.lat),
        lng: String(selectedDayPlace.lng),
        checkIn,
        checkOut,
        radius: "15",
        city: selectedDay.city || "",
        page: String(page),
        limit: "20",
      });
      if (hotelFilters.maxPrice) params.set("priceMax", String(hotelFilters.maxPrice));
      const response = await fetch(`/api/hotels?${params.toString()}`, {
        headers: authHeaders,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Hotel search failed (${response.status})`);
      }
      const data = await response.json();
      const incoming: HotelOption[] = data.hotels || [];
      setHotelResults((prev) => (append ? [...prev, ...incoming] : incoming));
      setHotelPage(page);
      setHasMoreHotels(incoming.length >= 20);
    } catch (error) {
      setHotelError(error instanceof Error ? error.message : "Could not load hotels");
      if (!append) setHotelResults([]);
    } finally {
      setHotelLoading(false);
    }
  }

  async function addHotelToPlan(hotel: HotelOption) {
    if (!selectedTrip || !selectedDay) return;
    if (!jsonHeaders) {
      setTripError("Sign in to save a hotel stay.");
      return;
    }
    if (!hotelNights || hotelNights < 1) {
      setHotelPlanError("Please choose at least one night.");
      return;
    }

    setHotelPlanError(null);
    setAddingHotelId(hotel.id);
    try {
      const res = await fetch(`/api/trips/${selectedTrip.id}/days/${selectedDay.id}/activities`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          title: `${hotel.name} stay`,
          startTime: "15:00",
          endTime: "22:00",
          notes: hotel.description || undefined,
          location: hotel.address || selectedDay.city,
          type: "hotel",
          metadata: {
            kind: "hotel",
            hotelId: hotel.id,
            nights: hotelNights,
            price: hotel.price,
            currency: hotel.currency,
            distanceKm: hotel.distanceKm,
            reviewScore: hotel.reviewScore,
            offer: hotel.offer,
            address: hotel.address,
            description: hotel.description,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to save hotel (${res.status})`);
      }
      const data = await res.json();
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
      setCalendarEventId(data.activity.id);
    } catch (error) {
      setHotelPlanError(error instanceof Error ? error.message : "Could not save hotel stay.");
    } finally {
      setAddingHotelId(null);
    }
  }

  async function handleTitleSuggestionSelect(suggestion: PlaceSuggestion) {
    try {
      setTitleSuggestions([]);
      setTitleSuggestionsError(null);
      setActivityForm((prev) => ({ ...prev, title: suggestion.primary }));
      const res = await fetch(`/api/maps/place?placeId=${suggestion.placeId}`);
      if (res.ok) {
        const data = await res.json();
        const address = data.address || suggestion.description;
        if (address) {
          setActivityForm((prev) => ({ ...prev, location: address }));
        }
      }
    } catch (error) {
      setTitleSuggestionsError(error instanceof Error ? error.message : "Failed to load place details");
    }
  }

  async function shareTripWithEmail() {
    if (!selectedTripId || !shareEmail.trim() || !jsonHeaders) return;
    setShareStatus(null);
    try {
      const res = await fetch(`/api/trips/${selectedTripId}/collaborators`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email: shareEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to share trip (${res.status})`);
      }
      setShareStatus("Shared");
      setShareEmail("");
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "Failed to share trip");
    }
  }

  function handleCityInputChange(value: string) {
    suppressSuggestionsRef.current = false;
    setCityQuery(value);
    setCitySuggestionsError(null);
    setDayForm((prev) => ({ ...prev, city: value }));
    if (selectedDayId && dayPlaces[selectedDayId] && value.trim() !== dayPlaces[selectedDayId].description) {
      setDayPlaces((prev) => {
        const clone = { ...prev };
        delete clone[selectedDayId];
        return clone;
      });
    }
  }

  async function handleCitySuggestionSelect(suggestion: PlaceSuggestion) {
    suggestionsAbortRef.current?.abort();
    suppressSuggestionsRef.current = true;
    setCitySuggestionsLoading(false);
    setCitySuggestions([]);
    setCitySuggestionsError(null);
    setCityQuery(suggestion.description);
    setDayForm((prev) => ({ ...prev, city: suggestion.description }));
    setPlacesSessionToken(createPlacesToken());

    if (!selectedDayId) return;
    setCityDetailsLoading(true);
    try {
      const response = await fetch(`/api/maps/place?placeId=${suggestion.placeId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load place");
      }
      const data = await response.json();
      const lat = data.location?.lat;
      const lng = data.location?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        setDayPlaces((prev) => ({
          ...prev,
          [selectedDayId]: {
            placeId: data.placeId || suggestion.placeId,
            description: data.address || suggestion.description,
            lat,
            lng,
          },
        }));
      }
    } catch (err) {
      console.error("Place details error", err);
      setCitySuggestionsError(err instanceof Error ? err.message : "Failed to load place");
    } finally {
      setCityDetailsLoading(false);
      suppressSuggestionsRef.current = false;
    }
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
          ? items
              .map((item) => `• ${item.title || "Idea"}: ${item.description || "Give it a whirl."}`)
              .join("\n")
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
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="flex items-center gap-4">
          <div className="rounded-full border-4 border-white bg-white shadow-md">
            <Image
              src="/fonda.png"
              alt="Fonda avatar"
              width={100}
              height={100}
              className="rounded-full"
              priority
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Fonda</p>
            <h2 className="text-xl font-semibold text-slate-900">Travel consultant</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chatLoading && <span className="text-xs text-slate-600">thinking...</span>}
          <button
            type="button"
            onClick={() => setChatExpanded((prev) => !prev)}
            className="hidden rounded-full border border-[#f1c0ff] px-3 py-1 text-xs text-slate-900 transition hover:border-[#d77dff] lg:inline-flex"
          >
            {chatExpanded ? "Compact" : "Expand"}
          </button>
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="rounded-full border border-[#f1c0ff] px-3 py-1 text-xs text-slate-900 transition hover:border-[#d77dff] lg:hidden"
          >
            Close
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto rounded-2xl border border-[#f5d9ff] bg-white/70 p-4 text-sm"
        style={{ minHeight: "320px" }}
        role="log"
        aria-live="polite"
        aria-label="Fonda chat history"
      >
        <div className="flex flex-col gap-3">
          {chatMessages.map((message) => (
            <div
              key={message.id}
              className={`max-w-full rounded-2xl px-4 py-2 ${
                message.role === "assistant"
                  ? "bg-white/90 text-slate-900 self-start"
                  : "bg-[#ffe6ff] text-slate-900 self-end"
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>
      </div>
      <form className="space-y-2 pt-4" onSubmit={sendChatMessage}>
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={!isAuthenticated}
          className="w-full rounded-2xl border border-[#f5d9ff] bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff] disabled:opacity-50"
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
    </div>
  );

  const chatColumnClass = chatExpanded
    ? "lg:grid-cols-[minmax(0,1fr),460px]"
    : "lg:grid-cols-[minmax(0,1fr),360px]";

  return (
    <div className="dayglow-page min-h-screen text-slate-900">
      <header className="border-b border-[#f5d9ff] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">{clientEnv.NEXT_PUBLIC_APP_NAME}</p>
            <h1 className="text-2xl font-semibold text-slate-900">The Trip Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{user.displayName || "Signed in"}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="rounded-full border border-[#f1c0ff] px-4 py-2 text-sm text-slate-900 transition hover:border-[#d77dff]"
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
        <section className="space-y-5 rounded-2xl border border-[#f5d9ff] bg-white/80 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">{headline}</p>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="min-w-[220px] rounded-2xl border border-[#f1c0ff] bg-white/80 px-4 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
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
                {selectedTrip && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      placeholder="Share with Gmail"
                      value={shareEmail}
                      onChange={(event) => setShareEmail(event.target.value)}
                      className="rounded-full border border-[#f1c0ff] bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                    />
                    <button
                      type="button"
                      onClick={() => shareTripWithEmail()}
                      disabled={!shareEmail.trim() || !selectedTripId}
                      className="rounded-full border border-[#ebaef5] px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-[#d77dff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Share trip
                    </button>
                    {shareStatus && <p className="text-xs text-slate-600">{shareStatus}</p>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowTripForm((prev) => !prev)}
                  className="rounded-full border border-[#ebaef5] px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-[#d77dff]"
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
                    className="rounded-full border border-[#f1c0ff] px-4 py-2 text-xs uppercase tracking-[0.3em] text-rose-500 transition hover:border-rose-200"
                  >
                    Delete trip
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  title="Edit days, cities, and activities"
                  onClick={() => setView("timeline")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    view === "timeline"
                      ? "bg-white text-slate-900"
                      : "border border-[#ebaef5] text-slate-900 hover:border-[#d77dff]"
                  }`}
                >
                  Edit trip
                </button>
                  <button
                    type="button"
                    title="Visualize the trip on a calendar"
                    onClick={() => setView("calendar")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      view === "calendar"
                        ? "bg-white text-slate-900"
                        : "border border-[#ebaef5] text-slate-900 hover:border-[#d77dff]"
                    }`}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen((prev) => !prev)}
                    className="rounded-full border border-[#f1c0ff] px-4 py-2 text-sm text-slate-900 transition hover:border-[#d77dff]"
                  >
                    {isChatOpen ? "Hide Fonda" : "Open Fonda"}
                  </button>
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-600 lg:max-w-md">
              {loadingTrips && <p className="text-xs text-slate-500">Loading trips...</p>}
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
            <div className="flex gap-2 overflow-x-auto rounded-full bg-white/80 px-3 py-2 text-xs">
              {selectedTrip.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayId(day.id)}
                  className={`rounded-full px-4 py-1 transition ${
                    selectedDayId === day.id
                      ? "bg-white text-slate-900"
                      : "bg-transparent text-slate-700 hover:bg-white"
                  }`}
                >
                  {format(new Date(day.date), "MMM d")}
                </button>
              ))}
            </div>
          )}

          {showTripForm && (
            <form className="grid gap-4 rounded-2xl border border-[#f5d9ff] bg-white/80 p-4" onSubmit={createTrip}>
              <div className="sm:col-span-2">
                <label className="text-sm text-slate-600" htmlFor="title">
                  Trip title
                </label>
                <input
                  id="title"
                  required
                  value={tripForm.title}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                  placeholder="Neon Riviera"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600" htmlFor="homeCity">
                  Base city
                </label>
                <input
                  id="homeCity"
                  value={tripForm.homeCity}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, homeCity: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                  placeholder="Lisbon"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-600" htmlFor="startDate">
                    Start date
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    value={tripForm.startDate}
                    onChange={(e) => setTripForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600" htmlFor="endDate">
                    End date
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    value={tripForm.endDate}
                    onChange={(e) => setTripForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm text-slate-600" htmlFor="description">
                  Notes / intent
                </label>
                <textarea
                  id="description"
                  value={tripForm.description}
                  onChange={(e) => setTripForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
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

        {view === "calendar" ? (
          <section className="space-y-4 rounded-2xl border border-[#f5d9ff] bg-white/80 p-6">
            {selectedTrip ? (
              <div className="space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Trip calendar</p>
                  <h2 className="text-2xl font-semibold text-slate-900">{selectedTrip.title}</h2>
                  <p className="text-sm text-slate-600">
                    {selectedTrip.startDate
                      ? `${format(new Date(selectedTrip.startDate), "MMM d")} – ${
                          selectedTrip.endDate
                            ? format(new Date(selectedTrip.endDate), "MMM d")
                            : format(new Date(selectedTrip.startDate), "MMM d")
                        }`
                      : `${selectedTrip.days.length} day${selectedTrip.days.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-7 text-xs uppercase tracking-[0.4em] text-fuchsia-500">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                      <div key={label} className="text-center">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {calendarWeeks.map((week, weekIndex) => (
                      <div key={`week-${weekIndex}`} className="grid grid-cols-7 gap-2">
                        {week.map((dateValue) => {
                          const dateKey = format(dateValue, "yyyy-MM-dd");
                          const tripDay = dayByDateKey[dateKey];
                          const isSelected = tripDay && tripDay.id === calendarDayId;
                          return (
                            <button
                              key={dateKey}
                              type="button"
                              disabled={!tripDay}
                              onClick={() => {
                                if (!tripDay) return;
                                setCalendarDayId(tripDay.id);
                                setCalendarEventId(tripDay.activities?.[0]?.id ?? null);
                              }}
                              className={`h-28 rounded-2xl border px-2 py-2 text-left text-xs transition ${
                                tripDay
                                  ? isSelected
                                    ? "border-[#e8b7ff] bg-white"
                                    : "border-[#f5d9ff] bg-white/80 hover:border-[#d77dff]"
                                  : "border-[#f9e9ff] bg-transparent text-fuchsia-500"
                              } ${tripDay ? "cursor-pointer" : "cursor-default"}`}
                            >
                              <div className="flex items-center justify-between text-slate-500">
                                <span className="text-sm font-semibold text-slate-900">
                                  {dateValue.getDate()}
                                </span>
                                {tripDay && <span className="text-[10px] uppercase">{tripDay.city}</span>}
                              </div>
                              {tripDay ? (
                                <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                                  {(tripDay.activities || []).slice(0, 2).map((activity) => (
                                    <li
                                      key={activity.id}
                                      className="flex gap-1"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setCalendarDayId(tripDay.id);
                                        setCalendarEventId(activity.id);
                                      }}
                                    >
                                      <span className="text-slate-500">
                                        {formatTime(activity.startTime)}
                                      </span>
                                      <span className="text-slate-900">{activity.title}</span>
                                    </li>
                                  ))}
                                  {(tripDay.activities?.length || 0) > 2 && (
                                    <li className="text-slate-500">
                                      + {(tripDay.activities?.length || 0) - 2} more
                                    </li>
                                  )}
                                </ul>
                              ) : (
                                <p className="mt-6 text-center text-slate-600">—</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {calendarDay ? (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Selected day</p>
                        <h3 className="text-xl font-semibold text-slate-900">
                          {format(new Date(calendarDay.date), "EEEE, MMMM d")}
                        </h3>
                        <p className="text-sm text-slate-600">{calendarDay.city}</p>
                        {calendarDay.notes && (
                          <p className="mt-2 text-sm text-slate-600">{calendarDay.notes}</p>
                        )}
                      </div>
                      {calendarHotels.length > 0 && (
                        <div className="space-y-2 rounded-2xl border border-[#f5d9ff] bg-white/70 p-3">
                          <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Hotel stays</p>
                          <ul className="space-y-1 text-sm text-slate-800">
                            {calendarHotels.map((activity) => {
                              const meta = getHotelMetadata(activity);
                              return (
                                <li key={activity.id} className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-slate-900">{activity.title}</p>
                                    <p className="text-xs text-slate-600">{formatTimeRange(activity)}</p>
                                    {meta?.nights && (
                                      <p className="text-xs text-slate-600">{meta.nights} night{meta.nights === 1 ? "" : "s"}</p>
                                    )}
                                  </div>
                                  {meta?.price && meta?.currency && (
                                    <span className="rounded-full bg-[#f8ebff] px-2 py-0.5 text-[11px] text-slate-800">
                                      {meta.price.toFixed(0)} {meta.currency}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      <div className="space-y-2">
                        {(calendarDay.activities || []).length ? (
                          calendarDay.activities?.map((activity) => (
                            <button
                              key={activity.id}
                              type="button"
                              onClick={() => setCalendarEventId(activity.id)}
                              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                activity.id === calendarEventId
                                  ? "border-[#e8b7ff] bg-white"
                                  : "border-[#f5d9ff] bg-white/70 hover:border-[#d77dff]"
                              }`}
                            >
                              <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                              <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">
                                {formatTimeRange(activity)}
                              </p>
                              {activity.location && (
                                <p className="text-xs text-slate-600">{activity.location}</p>
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-slate-600">No activities scheduled.</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-[#f5d9ff] bg-white/70 p-4">
                      {calendarEvent ? (
                        <>
                          <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Event detail</p>
                            <h4 className="text-lg font-semibold text-slate-900">{calendarEvent.title}</h4>
                            <p className="text-sm text-slate-600">{formatTimeRange(calendarEvent)}</p>
                          </div>
                          {calendarEventHotel && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                              <span className="rounded-full bg-[#f8ebff] px-2 py-0.5 text-[11px] uppercase tracking-[0.25em] text-slate-800">
                                Hotel
                              </span>
                              {calendarEventHotel.nights && (
                                <span>{calendarEventHotel.nights} night{calendarEventHotel.nights === 1 ? "" : "s"}</span>
                              )}
                              {calendarEventHotel.price && calendarEventHotel.currency && (
                                <span className="font-semibold text-slate-900">
                                  {calendarEventHotel.price.toFixed(0)} {calendarEventHotel.currency}
                                </span>
                              )}
                              {calendarEventHotel.offer && (
                                <a
                                  href={calendarEventHotel.offer}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sky-600 underline hover:text-sky-800"
                                >
                                  View offer
                                </a>
                              )}
                            </div>
                          )}
                          {calendarEvent.description && (
                            <p className="text-sm text-slate-700">{calendarEvent.description}</p>
                          )}
                          {calendarEvent.location && (
                            <p className="text-sm text-slate-700">
                              Destination: {calendarEvent.location}
                            </p>
                          )}
                          {calendarEvent.startLocation && (
                            <p className="text-sm text-slate-600">
                              Starts at {calendarEvent.startLocation}
                            </p>
                          )}
                          {calendarEvent.travelSummary && (
                            <p className="text-sm text-emerald-600">{calendarEvent.travelSummary}</p>
                          )}
                          <div className="overflow-hidden rounded-xl border border-[#f5d9ff]">
                            {calendarEvent.location ? (
                              <iframe
                                title={`Map for ${calendarEvent.title}`}
                                src={`https://maps.google.com/maps?q=${encodeURIComponent(
                                  calendarEvent.location,
                                )}&z=13&ie=UTF8&iwloc=&output=embed`}
                                className="h-48 w-full"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-48 items-center justify-center bg-white/90 text-xs text-slate-500">
                                No address set.
                              </div>
                            )}
                          </div>
                          {(calendarEvent.location || calendarEvent.startLocation) && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                                calendarEvent.startLocation || calendarDay.city || "",
                              )}&destination=${encodeURIComponent(calendarEvent.location || "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sky-600 underline hover:text-sky-800"
                            >
                              Open in Google Maps
                            </a>
                          )}
                          <button
                            type="button"
                            title="Jump to the trip editor to update this day"
                            onClick={() => {
                              setSelectedDayId(calendarDay.id);
                              setView("timeline");
                            }}
                            className="rounded-full border border-[#ebaef5] px-4 py-2 text-sm text-slate-900 transition hover:border-[#d77dff]"
                          >
                            Open trip editor
                          </button>
                        </>
                        ) : (
                          <p className="text-sm text-slate-600">Select an activity to see details.</p>
                        )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">Select a day to see details.</p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#f5d9ff] p-10 text-center text-slate-500">
                Select or create a trip to view its calendar.
              </div>
            )}
          </section>
        ) : (
          <div className={`flex flex-col gap-6 lg:grid ${chatColumnClass}`}>
            <section className="space-y-4 rounded-2xl border border-[#f5d9ff] bg-white/80 p-6">
            {selectedTrip ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Current trip</p>
                  <h2 className="text-2xl font-semibold text-slate-900">{selectedTrip.title}</h2>
                  <p className="text-sm text-slate-600">
                    {selectedTrip.homeCity || clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}
                  </p>
                </div>
                {selectedTrip.days.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto rounded-full bg-white/80 px-2 py-1 text-xs">
                    {selectedTrip.days.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => setSelectedDayId(day.id)}
                        className={`rounded-full px-3 py-1 transition ${
                          selectedDayId === day.id
                            ? "bg-white text-slate-900"
                            : "bg-transparent text-slate-700 hover:bg-white"
                        }`}
                      >
                        {format(new Date(day.date), "MMM d")}
                      </button>
                    ))}
                  </div>
                )}

                {selectedDay ? (
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Day overview</p>
                      <h3 className="text-xl font-semibold text-slate-900">
                        {format(new Date(selectedDay.date), "EEEE, MMMM d")}
                      </h3>
                    </div>

                    <form className="grid gap-4 md:grid-cols-2" onSubmit={saveDay}>
                      <div className="relative">
                        <label className="text-xs text-fuchsia-500" htmlFor="dayCity">
                          City
                        </label>
                        <input
                          id="dayCity"
                          autoComplete="off"
                          value={cityQuery}
                          onChange={(e) => handleCityInputChange(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/70 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                        />
                        {(citySuggestionsLoading || cityDetailsLoading) && (
                          <span className="absolute right-3 top-[30px] text-xs text-slate-500">
                            {cityDetailsLoading ? "Loading place..." : "Searching..."}
                          </span>
                        )}
                        {citySuggestionsError && (
                          <p className="mt-1 text-xs text-rose-500">{citySuggestionsError}</p>
                        )}
                        {citySuggestions.length > 0 && cityQuery && (
                          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-2xl border border-[#f5d9ff] bg-white/95 text-sm shadow-xl">
                            {citySuggestions.map((suggestion) => (
                              <li key={suggestion.placeId}>
                                <button
                                  type="button"
                                  onClick={() => handleCitySuggestionSelect(suggestion)}
                                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-slate-900 hover:bg-white"
                                >
                                  <span className="font-medium">{suggestion.primary}</span>
                                  {suggestion.secondary && (
                                    <span className="text-xs text-slate-500">{suggestion.secondary}</span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-fuchsia-500" htmlFor="dayNotes">
                          Notes / plans
                        </label>
                        <textarea
                          id="dayNotes"
                          rows={3}
                          value={dayForm.notes}
                          onChange={(e) => setDayForm((prev) => ({ ...prev, notes: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/70 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
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
                        <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Trip editor</p>
                        {orderedActivities.length ? (
                          <ol className="space-y-2">
                            {orderedActivities.map((activity) => {
                              const hotelMeta = getHotelMetadata(activity);
                              return (
                                <li
                                  key={activity.id}
                                  className="rounded-2xl border border-[#f5d9ff] bg-white/70 px-4 py-2"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                                        {hotelMeta && (
                                          <span className="rounded-full bg-[#f8ebff] px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-slate-800">
                                            Hotel
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">
                                        {formatTimeRange(activity)}
                                      </p>
                                      {hotelMeta?.nights && (
                                        <p className="text-xs text-slate-600">{hotelMeta.nights} night{hotelMeta.nights === 1 ? "" : "s"}</p>
                                      )}
                                      {activity.description && (
                                        <p className="text-xs text-slate-600">{activity.description}</p>
                                      )}
                                      {activity.location && (
                                        <p className="text-xs text-slate-600">
                                          {activity.location}
                                        </p>
                                      )}
                                      {activity.startLocation && (
                                        <p className="text-xs text-slate-500">
                                          Starts at {activity.startLocation}
                                        </p>
                                      )}
                                      {activity.travelSummary && (
                                        <p className="text-xs text-emerald-600">
                                          {activity.travelSummary}
                                        </p>
                                      )}
                                      {activity.startLocation && activity.location && (
                                        <a
                                          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                                            activity.startLocation,
                                          )}&destination=${encodeURIComponent(activity.location)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs text-sky-600 underline hover:text-sky-800"
                                        >
                                          Open route in Google Maps
                                        </a>
                                      )}
                                    </div>
                                    <div className="flex gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-600">
                                      <button
                                        type="button"
                                        onClick={() => handleEditActivity(activity)}
                                        className="rounded-full border border-[#ebaef5] px-2 py-0.5 hover:border-[#d77dff]"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteActivity(activity.id)}
                                        className="rounded-full border border-[#ebaef5] px-2 py-0.5 text-rose-500 hover:border-rose-200"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <p className="text-sm text-slate-600">No scheduled items yet.</p>
                        )}
                      </div>

                      <form className="space-y-3 rounded-2xl border border-[#f5d9ff] bg-white/70 p-3" onSubmit={saveActivity}>
                        <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">
                          {editingActivityId ? "Edit activity" : "Add activity"}
                        </p>
                      <div className="relative space-y-1">
                        <div className="flex items-center justify-between text-xs text-fuchsia-500">
                          <label htmlFor="activityTitle">Title</label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-600">
                            <input
                              type="checkbox"
                              checked={titleSuggestEnabled}
                              onChange={(event) => setTitleSuggestEnabled(event.target.checked)}
                              className="h-3 w-3 rounded border-[#f5d9ff] text-fuchsia-500 focus:ring-0"
                            />
                            Suggest places
                          </label>
                        </div>
                        <input
                          id="activityTitle"
                          required
                          value={activityForm.title}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, title: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/85 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                          placeholder="Midnight rooftop bar"
                          autoComplete="off"
                        />
                        {titleSuggestionsError && (
                          <p className="text-[11px] text-rose-500">{titleSuggestionsError}</p>
                        )}
                        {titleSuggestionsLoading && (
                          <p className="text-[11px] text-slate-500">Searching places...</p>
                        )}
                        {titleSuggestions.length > 0 && titleSuggestEnabled && (
                          <ul className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-2xl border border-[#f5d9ff] bg-white text-sm shadow-xl">
                            {titleSuggestions.map((suggestion) => (
                              <li key={suggestion.placeId}>
                                <button
                                  type="button"
                                  onClick={() => handleTitleSuggestionSelect(suggestion)}
                                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-white/80"
                                >
                                  <span className="font-medium text-slate-900">{suggestion.primary}</span>
                                  {suggestion.secondary && (
                                    <span className="text-xs text-slate-500">{suggestion.secondary}</span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-fuchsia-500" htmlFor="startTime">
                              Start
                            </label>
                            <input
                              id="startTime"
                              type="time"
                              required
                              value={activityForm.startTime}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, startTime: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-[#ebaef5] bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder-slate-500 focus:border-[#cf6dff]"
                        />
                          </div>
                          <div>
                            <label className="text-xs text-fuchsia-500" htmlFor="endTime">
                              End (optional)
                            </label>
                            <input
                              id="endTime"
                              type="time"
                              value={activityForm.endTime}
                              onChange={(e) => setActivityForm((prev) => ({ ...prev, endTime: e.target.value }))}
                              className="mt-1 w-full rounded-xl border border-[#ebaef5] bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder-slate-500 focus:border-[#cf6dff]"
                            />
                          </div>
                        </div>
                      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/60 px-3 py-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={isHotelActivity}
                            onChange={(event) => setIsHotelActivity(event.target.checked)}
                            className="h-4 w-4 rounded border-[#f5d9ff] text-fuchsia-500 focus:ring-0"
                          />
                          This is a hotel stay
                        </label>
                        {isHotelActivity && (
                          <div className="flex items-center gap-2 text-xs text-slate-700">
                            <span>Nights</span>
                            <input
                              type="number"
                              min={1}
                              value={hotelStayNights}
                              onChange={(event) =>
                                setHotelStayNights(Math.max(1, Number(event.target.value) || 1))
                              }
                              className="w-20 rounded-lg border border-[#f5d9ff] bg-white px-2 py-1 text-sm text-slate-900"
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <textarea
                          placeholder="Optional notes"
                          value={activityForm.notes}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, notes: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/85 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                          rows={2}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-fuchsia-500" htmlFor="activityLocation">
                          Address (optional)
                        </label>
                        <input
                          id="activityLocation"
                          value={activityForm.location}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, location: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                          placeholder="123 Rue Oberkampf, Paris"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-fuchsia-500" htmlFor="activityStartLocation">
                          Starting address (optional)
                        </label>
                        <input
                          id="activityStartLocation"
                          value={activityForm.startLocation}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, startLocation: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-[#f5d9ff] bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#cb82ff]"
                          placeholder="Hotel de Ville"
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
                              : "Add to day plan"}
                          </button>
                          {editingActivityId && (
                            <button
                              type="button"
                              onClick={cancelActivityEdit}
                              className="rounded-full border border-[#ebaef5] px-4 py-2 text-sm text-slate-900 transition hover:border-[#d77dff]"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {hotelActivities.length > 0 && (
                      <div className="space-y-2 rounded-2xl border border-[#f5d9ff] bg-white/70 p-3">
                        <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Hotel stays</p>
                        <ul className="space-y-2 text-sm text-slate-800">
                          {hotelActivities.map((activity) => {
                            const meta = getHotelMetadata(activity);
                            return (
                              <li key={activity.id} className="rounded-xl border border-[#f1c0ff] bg-white/80 px-3 py-2 shadow-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-900">{activity.title}</p>
                                    <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-500">
                                      {formatTimeRange(activity)}
                                    </p>
                                    {meta?.nights && (
                                      <p className="text-xs text-slate-600">{meta.nights} night{meta.nights === 1 ? "" : "s"}</p>
                                    )}
                                    {activity.location && (
                                      <p className="text-xs text-slate-600">{activity.location}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 text-[11px] uppercase tracking-[0.2em] text-slate-600">
                                    {meta?.price && meta?.currency && (
                                      <span className="rounded-full bg-[#f8ebff] px-2 py-0.5 text-slate-800">
                                        {meta.price.toFixed(0)} {meta.currency}
                                      </span>
                                    )}
                                    {meta?.offer && (
                                      <a
                                        href={meta.offer}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-[#ebaef5] px-2 py-0.5 text-slate-900 hover:border-[#d77dff]"
                                      >
                                        View
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {selectedDayPlace && (
                      <div className="space-y-2 rounded-2xl border border-[#f5d9ff] bg-white/70 p-3">
                        <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">City map</p>
                        <div className="overflow-hidden rounded-xl border border-[#f5d9ff]">
                          {!mapError ? (
                            <Image
                              key={`${selectedDayPlace.lat},${selectedDayPlace.lng}`}
                              src={`/api/maps/static?lat=${selectedDayPlace.lat}&lng=${selectedDayPlace.lng}`}
                              alt={`Map of ${selectedDayPlace.description}`}
                              width={1200}
                              height={640}
                              className="h-48 w-full object-cover"
                              unoptimized
                              onError={() => setMapError(true)}
                            />
                          ) : (
                            <iframe
                              key={`embed-${selectedDayPlace.lat}-${selectedDayPlace.lng}`}
                              title={`Map of ${selectedDayPlace.description}`}
                              src={`https://maps.google.com/maps?q=${selectedDayPlace.lat},${selectedDayPlace.lng}&z=13&output=embed`}
                              className="h-48 w-full"
                              loading="lazy"
                              allowFullScreen
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{selectedDayPlace.description}</p>
                            <p className="text-xs text-slate-500">
                              {selectedDayPlace.lat.toFixed(3)}, {selectedDayPlace.lng.toFixed(3)}
                            </p>
                          </div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedDayPlace.lat},${selectedDayPlace.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-[#ebaef5] px-4 py-1 text-xs uppercase tracking-[0.3em] text-slate-900 transition hover:border-[#d77dff]"
                          >
                            Open maps
                          </a>
                        </div>
                      </div>
                    )}

                    {selectedDayPlace && (
                      <div className="space-y-3 rounded-2xl border border-[#f5d9ff] bg-white/70 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-500">Nearby stays</p>
                            <p className="text-sm text-slate-600">Pull live offers within 15km.</p>
                            <p className="text-xs text-slate-500">Filter by rating, distance, or price.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => loadHotelsNearDay(1, false)}
                            disabled={hotelLoading}
                            className="rounded-full border border-[#ebaef5] px-3 py-1 text-xs font-semibold text-slate-900 transition hover:border-[#d77dff] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {hotelLoading ? "Searching..." : "Find hotels"}
                          </button>
                        </div>
                        {hotelError && <p className="text-xs text-rose-500">{hotelError}</p>}
                        {hotelPlanError && <p className="text-xs text-rose-500">{hotelPlanError}</p>}
                        {hotelResults.length > 0 ? (
                          <>
                            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                              <label className="flex flex-col gap-1">
                                <span>Nights</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={hotelNights}
                                  onChange={(event) =>
                                    setHotelNights(Math.max(1, Number(event.target.value) || 1))
                                  }
                                  className="rounded-xl border border-[#f5d9ff] bg-white/80 px-2 py-1 text-slate-900"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span>Min rating</span>
                                <select
                                  value={hotelFilters.minRating}
                                  onChange={(event) =>
                                    setHotelFilters((prev) => ({ ...prev, minRating: Number(event.target.value) }))
                                  }
                                  className="rounded-xl border border-[#f5d9ff] bg-white/80 px-2 py-1 text-slate-900"
                                >
                                  {[0, 6, 7, 8, 9].map((score) => (
                                    <option key={score} value={score}>
                                      {score === 0 ? "All" : `${score}+`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1">
                                <span>Max distance (km)</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={hotelFilters.maxDistance || ""}
                                  onChange={(event) =>
                                    setHotelFilters((prev) => ({
                                      ...prev,
                                      maxDistance: Number(event.target.value) || 0,
                                    }))
                                  }
                                  placeholder="e.g. 5"
                                  className="rounded-xl border border-[#f5d9ff] bg-white/80 px-2 py-1 text-slate-900"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span>Max price ({hotelResults[0]?.currency || "USD"})</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={hotelFilters.maxPrice || ""}
                                  onChange={(event) =>
                                    setHotelFilters((prev) => ({
                                      ...prev,
                                      maxPrice: Number(event.target.value) || 0,
                                    }))
                                  }
                                  placeholder="e.g. 300"
                                  className="rounded-xl border border-[#f5d9ff] bg-white/80 px-2 py-1 text-slate-900"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span>Sort by</span>
                                <select
                                  value={hotelSort}
                                  onChange={(event) =>
                                    setHotelSort(event.target.value as "price" | "rating" | "distance" | "none")
                                  }
                                  className="rounded-xl border border-[#f5d9ff] bg-white/80 px-2 py-1 text-slate-900"
                                >
                                  <option value="none">Default</option>
                                  <option value="price">Price</option>
                                  <option value="rating">Rating</option>
                                  <option value="distance">Distance</option>
                                </select>
                              </label>
                            </div>
                          <ul className="space-y-3">
                            {filteredHotels.slice(0, 4).map((hotel) => (
                              <li key={hotel.id} className="rounded-2xl border border-[#ebaef5] bg-white/85 px-3 py-2 text-sm shadow-sm">
                                <div className="flex flex-col gap-2">
                                  <div className="flex justify-between gap-2">
                                    <div>
                                      <p className="font-semibold text-slate-900">{hotel.name}</p>
                                      {hotel.address && <p className="text-xs text-slate-600">{hotel.address}</p>}
                                    </div>
                                    {hotel.offer && (
                                      <a
                                        href={hotel.offer}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="psychedelic-button rounded-full px-3 py-1 text-xs font-semibold text-slate-900"
                                      >
                                        Open
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                    {typeof hotel.price === "number" && hotel.currency && (
                                      <span className="font-semibold text-slate-900">
                                        {hotel.price.toFixed(0)} {hotel.currency}
                                      </span>
                                    )}
                                    {hotel.distanceKm && (
                                      <span>{hotel.distanceKm.toFixed(1)} km away</span>
                                    )}
                                    {hotel.reviewScore && (
                                      <span>⭐ {hotel.reviewScore.toFixed(1)}</span>
                                    )}
                                  </div>
                                  {hotel.description && (
                                    <p className="mt-1 text-xs text-slate-600">{hotel.description}</p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                                    <span className="rounded-full bg-[#f8ebff] px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-slate-800">
                                      Hotel stay
                                    </span>
                                    <span>{hotelNights} night{hotelNights === 1 ? "" : "s"}</span>
                                    <button
                                      type="button"
                                      onClick={() => addHotelToPlan(hotel)}
                                      disabled={addingHotelId === hotel.id || hotelLoading}
                                      className="rounded-full border border-[#ebaef5] px-3 py-1 font-semibold text-slate-900 transition hover:border-[#d77dff] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {addingHotelId === hotel.id ? "Adding..." : "Add to plan"}
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                            {hasMoreHotels && (
                              <div className="pt-2">
                                <button
                                  type="button"
                                  onClick={() => loadHotelsNearDay(hotelPage + 1, true)}
                                  disabled={hotelLoading}
                                  className="rounded-full border border-[#ebaef5] px-3 py-1 text-xs font-semibold text-slate-900 transition hover:border-[#d77dff] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {hotelLoading ? "Loading..." : "Load more"}
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {hotelLoading
                              ? "Fetching nearby hotels..."
                              : hotelResults.length
                              ? "No hotels match your filters"
                              : "No results yet — tap Find hotels."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">Select a day to edit it.</p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#f5d9ff] p-10 text-center text-slate-500">
                Select or create a trip to start planning.
              </div>
            )}
          </section>

          <div className="hidden lg:block">
            {isChatOpen ? (
              <aside
                className={`sticky top-8 flex h-[calc(100vh-6rem)] w-full flex-col rounded-2xl border border-[#f5d9ff] bg-white/80 p-6 ${
                  chatExpanded ? "shadow-2xl" : "shadow-lg"
                }`}
              >
                {chatPanelContent}
              </aside>
            ) : (
              <aside className="sticky top-8 flex h-[calc(100vh-6rem)] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#f1c0ff] bg-white/80 p-6 text-center text-slate-600">
                <p className="text-sm">Need ideas or timing help?</p>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="psychedelic-button rounded-full px-4 py-2 text-sm font-semibold"
                >
                  Chat with Fonda
                </button>
              </aside>
            )}
          </div>
        </div>
        )}

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
          <div className="fixed inset-0 z-40 bg-white/80 px-4 py-6 lg:hidden">
            <div className="mx-auto flex h-full max-w-md flex-col">
              <div className="flex h-full flex-col rounded-2xl border border-[#f5d9ff] bg-white p-5 shadow-2xl">
                {chatPanelContent}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
function applyHotelFilters(
  hotels: HotelOption[],
  filters: { minRating: number; maxDistance: number; maxPrice: number },
  sort: "price" | "rating" | "distance" | "none",
) {
  const filtered = hotels.filter((hotel) => {
    if (filters.minRating && (hotel.reviewScore ?? 0) < filters.minRating) return false;
    if (filters.maxDistance && (hotel.distanceKm ?? Infinity) > filters.maxDistance) return false;
    if (filters.maxPrice && (hotel.price ?? Infinity) > filters.maxPrice) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (sort === "price") {
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    }
    if (sort === "rating") {
      return (b.reviewScore ?? 0) - (a.reviewScore ?? 0);
    }
    if (sort === "distance") {
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    }
    return 0;
  });
}
