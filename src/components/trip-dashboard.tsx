"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

type Activity = {
  id: string;
  tripDayId: string;
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
  budget?: number | string | null;
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
  budget: "",
};

const emptyTripDetailsForm = {
  title: "",
  startDate: "",
  endDate: "",
  homeCity: clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY,
  description: "",
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

const buildTripContext = (trip: Trip | null, day: TripDay | null) => {
  if (!trip) return "";
  const parts: string[] = [];
  parts.push(`Trip "${trip.title}"${trip.homeCity ? ` (home: ${trip.homeCity})` : ""}`);
  if (day) {
    parts.push(`Current day: ${day.city}${day.date ? ` on ${day.date}` : ""}`);
    const planned = (day.activities || [])
      .slice(0, 6)
      .map((activity) => {
        const start = activity.startTime ? formatTime(activity.startTime) : null;
        const end = activity.endTime ? formatTime(activity.endTime) : null;
        const timeRange = start ? `${start}${end ? `-${end}` : ""}` : "";
        const location = activity.location ? ` @ ${activity.location}` : "";
        const label = activity.title || "Activity";
        return `${timeRange ? `${timeRange} ` : ""}${label}${location}`.trim();
      })
      .filter(Boolean)
      .join("; ");
    if (planned) {
      parts.push(`Today: ${planned}`);
    }
  }
  const otherStops = Array.from(
    new Set(trip.days.map((entry) => entry.city).filter((city) => city && city !== day?.city)),
  );
  if (otherStops.length) {
    parts.push(`Other stops: ${otherStops.join(", ")}`);
  }
  return parts.join(". ");
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

export function TripDashboard({
  initialTripId = null,
  initialView = "timeline",
}: {
  initialTripId?: string | null;
  initialView?: "timeline" | "calendar" | "dashboards";
}) {
  const { status, user, idToken, firebaseConfigured, signInWithGoogle, signOut, error } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayForm, setDayForm] = useState(emptyDayForm);
  const [savingDay, setSavingDay] = useState(false);
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const [activityDayId, setActivityDayId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingActivityOriginalDayId, setEditingActivityOriginalDayId] = useState<string | null>(null);
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
  const [tripDetailsForm, setTripDetailsForm] = useState(emptyTripDetailsForm);
  const [showTripDetailsForm, setShowTripDetailsForm] = useState(false);
  const [savingTripDetails, setSavingTripDetails] = useState(false);
  const [tripDetailsStatus, setTripDetailsStatus] = useState<string | null>(null);
  const [showAddDayForm, setShowAddDayForm] = useState(false);
  const [newDayForm, setNewDayForm] = useState({ date: "", city: "", notes: "" });
  const [savingNewDay, setSavingNewDay] = useState(false);
  const [titleSuggestEnabled, setTitleSuggestEnabled] = useState(true);
  const [titleSuggestions, setTitleSuggestions] = useState<PlaceSuggestion[]>([]);
  const [titleSuggestionsLoading, setTitleSuggestionsLoading] = useState(false);
  const [titleSuggestionsError, setTitleSuggestionsError] = useState<string | null>(null);
  const titleSuggestionsAbortRef = useRef<AbortController | null>(null);
  const activityUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [activityUploadLoading, setActivityUploadLoading] = useState(false);
  const [activityUploadError, setActivityUploadError] = useState<string | null>(null);
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
  const [view, setView] = useState<"timeline" | "calendar" | "dashboards">(initialView);
  const router = useRouter();
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

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
    [],
  );

  const parseBudgetInput = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

const formatBudget = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return currencyFormatter.format(value);
};

const getActivityBudgetValue = (activity: Activity) => {
    if (typeof activity.budget === "number") return activity.budget;
  if (typeof activity.budget === "string" && activity.budget.trim()) {
    const parsed = Number(activity.budget);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isTravelActivity = (activity: Activity) => {
  const type = (activity.type || "").toLowerCase();
  const title = (activity.title || "").toLowerCase();
  if (type.includes("travel") || type.includes("transit") || type.includes("train") || type.includes("flight")) return true;
  if (title.match(/train|flight|plane|drive|bus|ferry|uber|taxi|transit|transfer/)) return true;
  return Boolean(activity.travelDistanceMeters || activity.travelDurationSeconds || activity.travelSummary);
};

const getActivityDurationMinutes = (activity: Activity) => {
  if (!activity.startTime || !activity.endTime) return 0;
  const start = new Date(activity.startTime).getTime();
  const end = new Date(activity.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
};

const formatHoursLabel = (minutes: number) => {
  if (!minutes) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const sortDaysByDate = (days: TripDay[]) =>
  [...days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const sortActivitiesByStart = (activities: Activity[]) =>
  [...activities].sort((a, b) => {
    const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.title.localeCompare(b.title);
  });

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }

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
        const normalized = (data.trips || []).map((trip) => ({
          ...trip,
          days: sortDaysByDate(trip.days || []).map((day) => ({
            ...day,
            activities: sortActivitiesByStart(day.activities || []),
          })),
        }));
        setTrips(normalized);
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
  const calendarEventBudgetValue = calendarEvent ? formatBudget(getActivityBudgetValue(calendarEvent)) : null;

  const dayByDateKey = useMemo(() => {
    const map: Record<string, TripDay> = {};
    selectedTrip?.days.forEach((day) => {
      const key = format(new Date(day.date), "yyyy-MM-dd");
      map[key] = day;
    });
    return map;
  }, [selectedTrip]);

  const tripActivities = useMemo(() => {
    if (!selectedTrip) return [];
    return selectedTrip.days.flatMap((day) => {
      const dayLabel = day.date ? format(new Date(day.date), "MMM d") : "Day";
      return (day.activities || []).map((activity) => ({
        activity,
        day,
        dayLabel,
        city: day.city,
      }));
    });
  }, [selectedTrip]);

  const budgetStats = useMemo(() => {
    let total = 0;
    const buckets: Record<string, number> = {};
    const categorize = (activity: Activity) => {
      const title = (activity.title || "").toLowerCase();
      const type = (activity.type || "").toLowerCase();
      if (type === "hotel") return "Lodging";
      if (isTravelActivity(activity)) return "Transport";
      if (type.includes("food") || title.match(/dinner|lunch|breakfast|brunch|restaurant|cafe|bar|wine|food/))
        return "Food & drink";
      if (title.match(/museum|tour|walk|gallery|park|hike|show|concert|abbey|castle|cathedral/)) return "Activities";
      return "Other";
    };
    tripActivities.forEach(({ activity }) => {
      const value = getActivityBudgetValue(activity);
      if (value === null || value === undefined) return;
      total += value;
      const category = categorize(activity);
      buckets[category] = (buckets[category] || 0) + value;
    });
    const byCategory = Object.entries(buckets)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
    return { total, byCategory };
  }, [tripActivities]);

  const cityStops = useMemo(() => {
    if (!selectedTrip) {
      return { ordered: [] as Array<{ city: string; days: string[]; activityCount: number }>, routeLink: null as string | null };
    }
    const seen: Record<string, { city: string; days: string[]; activityCount: number }> = {};
    const order: string[] = [];
    sortDaysByDate(selectedTrip.days || []).forEach((day) => {
      const key = day.city || "Unlabeled stop";
      if (!seen[key]) {
        seen[key] = { city: key, days: [], activityCount: 0 };
        order.push(key);
      }
      seen[key].days.push(day.date);
      seen[key].activityCount += day.activities?.length || 0;
    });
    const ordered = order.map((city) => seen[city]);
    const cityNames = ordered.map((entry) => entry.city).filter(Boolean);
    let routeLink: string | null = null;
    if (cityNames.length >= 2) {
      const origin = encodeURIComponent(cityNames[0]);
      const destination = encodeURIComponent(cityNames[cityNames.length - 1]);
      const waypoints = cityNames.slice(1, -1).map(encodeURIComponent).join("|");
      routeLink = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${
        waypoints ? `&waypoints=${waypoints}` : ""
      }`;
    }
    return { ordered, routeLink };
  }, [selectedTrip]);

  const travelStats = useMemo(() => {
    if (!selectedTrip) {
      return {
        dayStats: [] as Array<{ day: TripDay; durationSeconds: number; distanceMeters: number }>,
        totalSeconds: 0,
        totalMeters: 0,
      };
    }
    const dayStats = selectedTrip.days.map((day) => {
      const travelActivities = (day.activities || []).filter((activity) => isTravelActivity(activity));
      const durationSeconds = travelActivities.reduce((sum, activity) => sum + (activity.travelDurationSeconds || 0), 0);
      const distanceMeters = travelActivities.reduce((sum, activity) => sum + (activity.travelDistanceMeters || 0), 0);
      return { day, durationSeconds, distanceMeters };
    });
    const totalSeconds = dayStats.reduce((sum, stat) => sum + stat.durationSeconds, 0);
    const totalMeters = dayStats.reduce((sum, stat) => sum + stat.distanceMeters, 0);
    return { dayStats, totalSeconds, totalMeters };
  }, [selectedTrip]);

  const topTravelDays = useMemo(
    () =>
      travelStats.dayStats
        .filter((stat) => stat.durationSeconds > 0 || stat.distanceMeters > 0)
        .sort((a, b) => b.durationSeconds - a.durationSeconds || b.distanceMeters - a.distanceMeters)
        .slice(0, 3),
    [travelStats],
  );

  const coverageStats = useMemo(() => {
    if (!selectedTrip) return { byCity: [] as Array<{ city: string; planned: number; days: number }> };
    const map: Record<string, { city: string; planned: number; days: number }> = {};
    selectedTrip.days.forEach((day) => {
      const key = day.city || "Unlabeled stop";
      const current = map[key] || { city: key, planned: 0, days: 0 };
      current.planned += day.activities?.length || 0;
      current.days += 1;
      map[key] = current;
    });
    const byCity = Object.values(map).sort((a, b) => b.planned - a.planned);
    return { byCity };
  }, [selectedTrip]);

  const scheduleStats = useMemo(() => {
    if (!selectedTrip) {
      return {
        dayStats: [] as Array<{ day: TripDay; minutes: number }>,
        busiest: null as TripDay | null,
        lightest: null as TripDay | null,
        avgMinutes: 0,
      };
    }
    const dayStats = selectedTrip.days.map((day) => {
      const minutes = (day.activities || []).reduce((sum, activity) => sum + getActivityDurationMinutes(activity), 0);
      return { day, minutes };
    });
    const busiest = dayStats.reduce((prev, curr) => (prev && prev.minutes >= curr.minutes ? prev : curr), dayStats[0] || null);
    const lightest = dayStats.reduce((prev, curr) => (prev && prev.minutes <= curr.minutes ? prev : curr), dayStats[0] || null);
    const avgMinutes =
      dayStats.length > 0 ? Math.round(dayStats.reduce((sum, stat) => sum + stat.minutes, 0) / dayStats.length) : 0;
    return { dayStats, busiest: busiest?.day ?? null, lightest: lightest?.day ?? null, avgMinutes };
  }, [selectedTrip]);

  const lodgingStats = useMemo(() => {
    if (!selectedTrip) return { nightsPlanned: 0, missing: [] as TripDay[] };
    const missing = selectedTrip.days.filter((day) => !(day.activities || []).some((activity) => activity.type === "hotel"));
    return { nightsPlanned: selectedTrip.days.length - missing.length, missing };
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
      setEditingActivityOriginalDayId(null);
      setActivityForm(emptyActivityForm);
      setActivityDayId(selectedDay.id);
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
      setActivityDayId(null);
      setEditingActivityOriginalDayId(null);
    }
  }, [selectedDay, dayPlaces]);

  useEffect(() => {
    if (!selectedTrip) {
      setTripDetailsForm(emptyTripDetailsForm);
      return;
    }
    setTripDetailsForm({
      title: selectedTrip.title,
      homeCity: selectedTrip.homeCity || "",
      startDate: selectedTrip.startDate ? new Date(selectedTrip.startDate).toISOString().slice(0, 10) : "",
      endDate: selectedTrip.endDate ? new Date(selectedTrip.endDate).toISOString().slice(0, 10) : "",
      description: selectedTrip.description || "",
    });
  }, [selectedTrip]);

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
    const targetDayId = activityDayId ?? selectedDay?.id ?? null;
    if (!selectedTrip || !targetDayId || !activityForm.title || !activityForm.startTime) {
      setTripError("Select a day and provide a title and start time.");
      return;
    }
    const targetDay = selectedTrip.days.find((day) => day.id === targetDayId);
    if (!targetDay) {
      setTripError("Pick a valid trip day for this activity.");
      return;
    }
    const originalDayId = editingActivityOriginalDayId ?? selectedDay?.id ?? null;
    if (editingActivityId && !originalDayId) {
      setTripError("Could not determine the original day for this activity.");
      return;
    }
    setSavingActivity(true);
    setTripError(null);
    const budgetValue = parseBudgetInput(activityForm.budget);
    const payload = {
      title: activityForm.title,
      startTime: activityForm.startTime,
      endTime: activityForm.endTime || undefined,
      notes: activityForm.notes || undefined,
      location: activityForm.location || undefined,
      startLocation: activityForm.startLocation || undefined,
      type: isHotelActivity ? "hotel" : undefined,
      metadata: isHotelActivity ? { kind: "hotel", nights: hotelStayNights } : undefined,
      budget: budgetValue,
    };

    try {
      const daysSorted = [...selectedTrip.days].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const startIndex = daysSorted.findIndex((day) => day.id === targetDayId);

      // If user marks multi-night hotel, create one activity per night across consecutive days.
      if (isHotelActivity && hotelStayNights > 1 && !editingActivityId) {
        if (startIndex === -1 || startIndex + hotelStayNights > daysSorted.length) {
          setTripError("Trip does not have enough days for that many nights.");
          return;
        }

        const created: Activity[] = [];
        for (let index = 0; index < hotelStayNights; index += 1) {
          const day = daysSorted[startIndex + index];
          const res = await fetch(`/api/trips/${selectedTrip.id}/days/${day.id}/activities`, {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
              ...payload,
              metadata: {
                kind: "hotel",
                nights: hotelStayNights,
                night: index + 1,
                ...(payload.metadata || {}),
              },
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `Failed to save hotel stay (${res.status})`);
          }
          const data = await res.json();
          created.push(data.activity as Activity);
        }

        setTrips((prev) =>
          prev.map((trip) =>
            trip.id === selectedTrip.id
              ? {
                  ...trip,
                  days: trip.days.map((day) => {
                    const newActivities = created.filter((item) => item.tripDayId === day.id);
                    return newActivities.length
                      ? { ...day, activities: sortActivitiesByStart([...(day.activities || []), ...newActivities]) }
                      : day;
                  }),
                }
              : trip,
          ),
        );
        setSelectedDayId(targetDayId);
        setActivityDayId(targetDayId);
      } else {
        const endpoint = editingActivityId
          ? `/api/trips/${selectedTrip.id}/days/${originalDayId}/activities/${editingActivityId}`
          : `/api/trips/${selectedTrip.id}/days/${targetDayId}/activities`;
        const res = await fetch(endpoint, {
          method: editingActivityId ? "PATCH" : "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            ...payload,
            dayId: editingActivityId && originalDayId !== targetDayId ? targetDayId : undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to save activity (${res.status})`);
        }
        const data = await res.json();
        const updatedActivity = data.activity as Activity;
        const destinationDayId = updatedActivity.tripDayId;
        const sourceDayId = editingActivityId ? originalDayId : destinationDayId;
        setTrips((prev) =>
          prev.map((trip) =>
            trip.id === selectedTrip.id
              ? {
                  ...trip,
                  days: trip.days.map((day) => {
                    if (day.id === destinationDayId) {
                      const others = (day.activities || []).filter((activity) => activity.id !== updatedActivity.id);
                      const nextActivities = sortActivitiesByStart([...others, updatedActivity]);
                      return { ...day, activities: nextActivities };
                    }
                    if (editingActivityId && sourceDayId && day.id === sourceDayId && sourceDayId !== destinationDayId) {
                      return {
                        ...day,
                        activities: (day.activities || []).filter((activity) => activity.id !== updatedActivity.id),
                      };
                    }
                    return day;
                  }),
                }
              : trip,
          ),
        );
        setSelectedDayId(destinationDayId);
        setActivityDayId(destinationDayId);
      }

      setActivityForm(emptyActivityForm);
      setEditingActivityId(null);
      setEditingActivityOriginalDayId(null);
      setIsHotelActivity(false);
      setHotelStayNights(1);
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Failed to save activity");
    } finally {
      setSavingActivity(false);
    }
  }

  async function handleActivityUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const MAX_SIZE_BYTES = 6 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setActivityUploadError("File too large. Max 6MB.");
      event.target.value = "";
      return;
    }
    try {
      setActivityUploadLoading(true);
      setActivityUploadError(null);
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/ai/activity-from-upload", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          data: base64,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to analyze document (${res.status})`);
      }
      const data = await res.json();
      const activity = data.activity || {};
      setActivityForm((prev) => ({
        ...prev,
        title: activity.title || prev.title,
        notes: activity.notes || prev.notes,
        location: activity.location || prev.location,
        startLocation: activity.startLocation || prev.startLocation,
        startTime: activity.startTime || prev.startTime,
        endTime: activity.endTime || prev.endTime,
        budget:
          typeof activity.budget === "number" && !Number.isNaN(activity.budget)
            ? String(activity.budget)
            : prev.budget,
      }));
      setTitleSuggestEnabled(false);
      if (typeof activity.type === "string" && activity.type.toLowerCase() === "hotel") {
        setIsHotelActivity(true);
      }
    } catch (error) {
      setActivityUploadError(error instanceof Error ? error.message : "Failed to analyze document");
    } finally {
      setActivityUploadLoading(false);
      event.target.value = "";
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
    setEditingActivityOriginalDayId(activity.tripDayId);
    setActivityDayId(activity.tripDayId);
    const hotelMeta = getHotelMetadata(activity);
    setActivityForm({
      title: activity.title,
      startTime: activity.startTime ? formatTime(activity.startTime) : "",
      endTime: activity.endTime ? formatTime(activity.endTime) : "",
      notes: activity.description || "",
      location: activity.location || "",
      startLocation: activity.startLocation || "",
      budget: activity.budget ? String(activity.budget) : "",
    });
    setIsHotelActivity(Boolean(hotelMeta));
    setHotelStayNights(hotelMeta?.nights && hotelMeta.nights > 0 ? hotelMeta.nights : 1);
  }

  function cancelActivityEdit() {
    setEditingActivityId(null);
    setEditingActivityOriginalDayId(null);
    setActivityForm(emptyActivityForm);
    setActivityDayId(selectedDay?.id ?? null);
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
                    ? { ...day, activities: sortActivitiesByStart([...(day.activities || []), data.activity]) }
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

  async function saveTripDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip) return;
    setSavingTripDetails(true);
    setTripError(null);
    setTripDetailsStatus(null);
    try {
      const res = await fetch(`/api/trips/${selectedTrip.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          title: tripDetailsForm.title,
          description: tripDetailsForm.description,
          homeCity: tripDetailsForm.homeCity,
          startDate: tripDetailsForm.startDate || undefined,
          endDate: tripDetailsForm.endDate || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to update trip (${res.status})`);
      }
      const data = await res.json();
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                title: data.trip.title,
                description: data.trip.description,
                homeCity: data.trip.homeCity,
                startDate: data.trip.startDate,
                endDate: data.trip.endDate,
              }
            : trip,
        ),
      );
      setTripDetailsStatus("Trip updated");
    } catch (error) {
      setTripError(error instanceof Error ? error.message : "Failed to update trip");
    } finally {
      setSavingTripDetails(false);
    }
  }

  async function addTripDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip) return;
    if (!newDayForm.date || !newDayForm.city.trim()) {
      setTripError("Date and city are required to add a day.");
      return;
    }
    setSavingNewDay(true);
    setTripError(null);
    try {
      const res = await fetch(`/api/trips/${selectedTrip.id}/days`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          date: newDayForm.date,
          city: newDayForm.city,
          notes: newDayForm.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to add day (${res.status})`);
      }
      const data = await res.json();
      const created = data.day as TripDay;
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                days: sortDaysByDate([...(trip.days || []), { ...created, activities: [] }]),
              }
            : trip,
        ),
      );
      setSelectedDayId(created.id);
      setShowAddDayForm(false);
      setNewDayForm({ date: "", city: "", notes: "" });
      setTripDetailsStatus("Day added");
    } catch (error) {
      setTripError(error instanceof Error ? error.message : "Failed to add day");
    } finally {
      setSavingNewDay(false);
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
    const tripContext = buildTripContext(selectedTrip, selectedDay);
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
          message: trimmed,
          tripContext,
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
          <div className="flex-shrink-0 rounded-full border-4 border-dayglo-void bg-white shadow-hard">
            <Image
              src="/fonda.png"
              alt="Fonda avatar"
              width={144}
              height={144}
              className="h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36"
              priority
            />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Fonda</p>
            <h2 className="text-xl font-black text-dayglo-void">Travel consultant</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chatLoading && <span className="text-xs font-black text-dayglo-void">thinking...</span>}
          <button
            type="button"
            onClick={() => setChatExpanded((prev) => !prev)}
            className="hidden rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none lg:inline-flex"
          >
            {chatExpanded ? "Compact" : "Expand"}
          </button>
          <button
            type="button"
            onClick={() => setIsChatOpen(false)}
            className="rounded-md border-2 border-dayglo-void bg-dayglo-orange px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none lg:hidden"
          >
            Close
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto rounded-lg border-2 border-dayglo-void bg-dayglo-yellow/30 p-4 text-sm shadow-hard"
        style={{ minHeight: "320px" }}
        role="log"
        aria-live="polite"
        aria-label="Fonda chat history"
      >
        <div className="flex flex-col gap-3">
          {chatMessages.map((message) => (
            <div
              key={message.id}
              className={`max-w-full rounded-md px-4 py-2 whitespace-pre-line leading-relaxed ${
                message.role === "assistant"
                  ? "self-start border-2 border-dayglo-void bg-white text-dayglo-void shadow-hard-sm"
                  : "self-end border-2 border-dayglo-void bg-dayglo-void text-white shadow-hard-sm"
              }`}
            >
              <p>{message.text}</p>
            </div>
          ))}
        </div>
      </div>
      <form className="space-y-2 pt-4" onSubmit={sendChatMessage}>
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={!isAuthenticated}
          className="w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard disabled:opacity-50"
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
          className="w-full rounded-md border-2 border-dayglo-void bg-dayglo-lime py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="min-h-screen bg-paper text-dayglo-void">
      <header className="border-b-2 border-dayglo-void bg-dayglo-yellow/40 shadow-hard">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">{clientEnv.NEXT_PUBLIC_APP_NAME}</p>
            <h1 className="text-3xl font-black text-dayglo-void">The Trip Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <div className="text-right">
                  <p className="text-sm font-black text-dayglo-void">{user.displayName || "Signed in"}</p>
                  <p className="text-xs text-dayglo-void/70">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => signInWithGoogle().catch((err) => setTripError(err.message))}
                disabled={!firebaseConfigured || status === "loading"}
                className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-5 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {firebaseConfigured ? "Sign in with Google" : "Configure Firebase"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
        <section className="space-y-5 rounded-lg border-2 border-dayglo-void bg-paper p-6 shadow-hard">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">{headline}</p>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="min-w-[220px] rounded-md border-2 border-dayglo-void bg-white px-4 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
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
                      className="rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                    />
                    <button
                      type="button"
                      onClick={() => shareTripWithEmail()}
                      disabled={!shareEmail.trim() || !selectedTripId}
                      title="Email this trip to the address above"
                      className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Share trip
                    </button>
                    {shareStatus && <p className="text-xs text-slate-600">{shareStatus}</p>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/start")}
                  title="Launch the new trip wizard"
                  className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                >
                  New trip
                </button>
                {selectedTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete trip "${selectedTrip.title}"?`)) {
                        deleteTrip(selectedTrip.id);
                      }
                    }}
                    title="Permanently delete this trip"
                    className="rounded-md border-2 border-dayglo-void bg-dayglo-orange px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                  >
                    Delete trip
                  </button>
                )}
                {selectedTrip && (
                  <button
                    type="button"
                    onClick={() => setShowTripDetailsForm((prev) => !prev)}
                    title="Edit this trip's details"
                    className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                  >
                    {showTripDetailsForm ? "Hide trip editor" : "Trip settings"}
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  title="Edit days, cities, and activities"
                  onClick={() => setView("timeline")}
                  className={`rounded-md border-2 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] transition ${
                    view === "timeline"
                      ? "bg-dayglo-lime border-dayglo-void text-dayglo-void shadow-hard"
                      : "border-dayglo-void text-dayglo-void shadow-hard-sm hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF]"
                  }`}
                >
                  Timeline
                </button>
                  <button
                    type="button"
                    title="Visualize the trip on a calendar"
                    onClick={() => setView("calendar")}
                    className={`rounded-md border-2 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] transition ${
                      view === "calendar"
                        ? "bg-dayglo-lime border-dayglo-void text-dayglo-void shadow-hard"
                        : "border-dayglo-void text-dayglo-void shadow-hard-sm hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF]"
                    }`}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    title="View budget, travel, and coverage dashboards"
                    onClick={() => setView("dashboards")}
                    className={`rounded-md border-2 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] transition ${
                      view === "dashboards"
                        ? "bg-dayglo-lime border-dayglo-void text-dayglo-void shadow-hard"
                        : "border-dayglo-void text-dayglo-void shadow-hard-sm hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF]"
                    }`}
                  >
                    Dashboards
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen((prev) => !prev)}
                    title="Toggle Fonda, the AI co-pilot"
                    className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
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

          {selectedTrip && (
            <div className="flex flex-wrap gap-2 rounded-lg border-2 border-dayglo-void bg-dayglo-yellow/30 px-3 py-2 text-xs shadow-hard [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
              {selectedTrip.days.length ? (
                selectedTrip.days.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setSelectedDayId(day.id)}
                    className={`rounded-md border-2 px-4 py-1 font-black uppercase tracking-[0.2em] transition-transform ${
                      selectedDayId === day.id
                        ? "border-dayglo-void bg-dayglo-void text-dayglo-yellow translate-y-1 shadow-none"
                        : "border-dayglo-void bg-white text-dayglo-void hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF] shadow-hard-sm"
                    }`}
                  >
                    {format(new Date(day.date), "MMM d")}
                  </button>
                ))
              ) : (
                <p className="text-xs font-semibold text-dayglo-void">No days yet.</p>
              )}
              <button
                type="button"
                onClick={() => setShowAddDayForm((prev) => !prev)}
                className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard-sm transition hover:bg-dayglo-yellow hover:translate-y-[1px] hover:shadow-none"
              >
                {showAddDayForm ? "Close" : "Add day(s)"}
              </button>
            </div>
          )}

          {showAddDayForm && selectedTrip && (
            <form
              className="grid gap-3 rounded-lg border-2 border-dayglo-void bg-paper p-3 shadow-hard"
              onSubmit={addTripDay}
            >
              <div>
                <label className="text-xs font-black uppercase" htmlFor="newDayDate">
                  Date
                </label>
                <input
                  id="newDayDate"
                  type="date"
                  value={newDayForm.date}
                  onChange={(e) => setNewDayForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase" htmlFor="newDayCity">
                  City
                </label>
                <input
                  id="newDayCity"
                  value={newDayForm.city}
                  onChange={(e) => setNewDayForm((prev) => ({ ...prev, city: e.target.value }))}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase" htmlFor="newDayNotes">
                  Notes
                </label>
                <textarea
                  id="newDayNotes"
                  value={newDayForm.notes}
                  onChange={(e) => setNewDayForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                />
              </div>
              <button
                type="submit"
                disabled={savingNewDay}
                className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-wait"
              >
                {savingNewDay ? "Adding..." : "Add day(s)"}
              </button>
            </form>
          )}

          {showTripDetailsForm && selectedTrip && (
            <form
              className="grid gap-4 rounded-lg border-2 border-dayglo-void bg-paper p-4 shadow-hard"
              onSubmit={saveTripDetails}
            >
              <div className="sm:col-span-2">
                <label className="text-sm font-black text-dayglo-void" htmlFor="tripTitle">
                  Trip title
                </label>
                <input
                  id="tripTitle"
                  required
                  value={tripDetailsForm.title}
                  onChange={(e) => setTripDetailsForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                />
              </div>
              <div>
                <label className="text-sm font-black text-dayglo-void" htmlFor="tripHomeCity">
                  Base city
                </label>
                <input
                  id="tripHomeCity"
                  value={tripDetailsForm.homeCity}
                  onChange={(e) => setTripDetailsForm((prev) => ({ ...prev, homeCity: e.target.value }))}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-black text-dayglo-void" htmlFor="tripStart">
                    Start date
                  </label>
                  <input
                    id="tripStart"
                    type="date"
                    value={tripDetailsForm.startDate}
                    onChange={(e) => setTripDetailsForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                  />
                </div>
                <div>
                  <label className="text-sm font-black text-dayglo-void" htmlFor="tripEnd">
                    End date
                  </label>
                  <input
                    id="tripEnd"
                    type="date"
                    value={tripDetailsForm.endDate}
                    onChange={(e) => setTripDetailsForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-black text-dayglo-void" htmlFor="tripDescription">
                  Notes / intent
                </label>
                <textarea
                  id="tripDescription"
                  value={tripDetailsForm.description}
                  onChange={(e) => setTripDetailsForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingTripDetails}
                  className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-wait"
                >
                  {savingTripDetails ? "Saving..." : "Save trip"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTripDetailsForm(false);
                    setTripDetailsStatus(null);
                    if (selectedTrip) {
                      setTripDetailsForm({
                        title: selectedTrip.title,
                        homeCity: selectedTrip.homeCity || "",
                        startDate: selectedTrip.startDate
                          ? new Date(selectedTrip.startDate).toISOString().slice(0, 10)
                          : "",
                        endDate: selectedTrip.endDate
                          ? new Date(selectedTrip.endDate).toISOString().slice(0, 10)
                          : "",
                        description: selectedTrip.description || "",
                      });
                    }
                  }}
                  className="rounded-md border-2 border-dayglo-void bg-dayglo-orange px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                >
                  Cancel
                </button>
                {tripDetailsStatus && <p className="text-xs text-dayglo-void">{tripDetailsStatus}</p>}
              </div>
            </form>
          )}
        </section>

        {view === "calendar" ? (
          <section className="space-y-4 rounded-lg border-2 border-dayglo-void bg-paper p-6 shadow-hard">
            {selectedTrip ? (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Trip calendar</p>
                  <h2 className="text-2xl font-black text-dayglo-void">{selectedTrip.title}</h2>
                  <p className="text-sm font-semibold text-dayglo-void">
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
                  <div className="grid grid-cols-7 text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">
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
                              className={`h-28 rounded-lg border-2 px-2 py-2 text-left text-xs font-semibold transition shadow-hard-sm ${
                                tripDay
                                  ? isSelected
                                    ? "border-dayglo-void bg-white"
                                    : "border-dayglo-void bg-paper hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF]"
                                  : "border-dayglo-void bg-dayglo-yellow/30 text-dayglo-void"
                              } ${tripDay ? "cursor-pointer" : "cursor-default"}`}
                            >
                              <div className="flex items-center justify-between text-slate-500">
                                <span className="text-sm font-black text-dayglo-void">
                                  {dateValue.getDate()}
                                </span>
                                {tripDay && <span className="text-[10px] font-black uppercase text-dayglo-pink">{tripDay.city}</span>}
                              </div>
                              {tripDay ? (
                                <ul className="mt-2 hidden space-y-1 text-[11px] text-dayglo-void sm:block">
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
                                      <span className="text-dayglo-void/60">
                                        {formatTime(activity.startTime)}
                                      </span>
                                      <span className="text-dayglo-void font-semibold">{activity.title}</span>
                                    </li>
                                  ))}
                                  {(tripDay.activities?.length || 0) > 2 && (
                                    <li className="text-dayglo-void/70 font-semibold">
                                      + {(tripDay.activities?.length || 0) - 2} more
                                    </li>
                                  )}
                                </ul>
                              ) : (
                                <p className="mt-6 hidden text-center text-dayglo-void/60 sm:block">—</p>
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
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Selected day</p>
                        <h3 className="text-xl font-black text-dayglo-void">
                          {format(new Date(calendarDay.date), "EEEE, MMMM d")}
                        </h3>
                        <p className="text-sm font-semibold text-dayglo-void">{calendarDay.city}</p>
                        {calendarDay.notes && (
                          <p className="mt-2 text-sm text-dayglo-void">{calendarDay.notes}</p>
                        )}
                      </div>
                      {calendarHotels.length > 0 && (
                        <div className="space-y-2 rounded-lg border-2 border-dayglo-void bg-paper p-3 shadow-hard">
                          <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Hotel stays</p>
                          <ul className="space-y-1 text-sm text-dayglo-void">
                            {calendarHotels.map((activity) => {
                              const meta = getHotelMetadata(activity);
                              return (
                                <li key={activity.id} className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-black text-dayglo-void">{activity.title}</p>
                                    <span className="data-mono inline-flex items-center border border-dayglo-void bg-dayglo-pink px-2 py-0.5 text-xs font-bold text-dayglo-void shadow-[2px_2px_0px_0px_#050505]">
                                      {formatTimeRange(activity)}
                                    </span>
                                    {meta?.nights && (
                                      <p className="text-xs font-semibold text-dayglo-void">{meta.nights} night{meta.nights === 1 ? "" : "s"}</p>
                                    )}
                                  </div>
                                  {meta?.price && meta?.currency && (
                                    <span className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-2 py-0.5 text-[11px] font-black text-dayglo-void shadow-hard-sm">
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
                              className={`w-full rounded-lg border-2 px-4 py-3 text-left font-semibold transition ${
                                activity.id === calendarEventId
                                  ? "border-dayglo-void bg-white shadow-hard"
                                  : "border-dayglo-void bg-paper shadow-hard-sm hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF]"
                              }`}
                            >
                              <p className="text-sm font-black text-dayglo-void">{activity.title}</p>
                              <span className="data-mono inline-flex items-center border border-dayglo-void bg-dayglo-pink px-2 py-0.5 text-[11px] font-bold uppercase text-dayglo-void shadow-[2px_2px_0px_0px_#050505]">
                                {formatTimeRange(activity)}
                              </span>
                              {activity.location && (
                                <p className="text-xs text-dayglo-void/80">{activity.location}</p>
                              )}
                              {(() => {
                                const budgetValue = getActivityBudgetValue(activity);
                                if (budgetValue === null) return null;
                                return (
                                  <p className="data-mono text-[11px] text-dayglo-void">
                                    Budget {formatBudget(budgetValue)}
                                  </p>
                                );
                              })()}
                            </button>
                          ))
                        ) : (
                          <p className="text-sm font-semibold text-dayglo-void/70">No activities scheduled.</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border-2 border-dayglo-void bg-paper p-4 shadow-hard">
                      {calendarEvent ? (
                        <>
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Event detail</p>
                            <h4 className="text-lg font-black text-dayglo-void">{calendarEvent.title}</h4>
                            <span className="data-mono inline-flex items-center border border-dayglo-void bg-dayglo-pink px-2 py-0.5 text-xs font-bold text-dayglo-void shadow-[2px_2px_0px_0px_#050505]">
                              {formatTimeRange(calendarEvent)}
                            </span>
                          </div>
                          {calendarEventHotel && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-dayglo-void">
                              <span className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.25em] text-dayglo-void shadow-hard-sm">
                                Hotel
                              </span>
                              {calendarEventHotel.nights && (
                                <span className="font-semibold">{calendarEventHotel.nights} night{calendarEventHotel.nights === 1 ? "" : "s"}</span>
                              )}
                              {calendarEventHotel.price && calendarEventHotel.currency && (
                                <span className="font-black text-dayglo-void">
                                  {calendarEventHotel.price.toFixed(0)} {calendarEventHotel.currency}
                                </span>
                              )}
                              {calendarEventHotel.offer && (
                                <a
                                  href={calendarEventHotel.offer}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-black text-dayglo-cyan underline hover:text-dayglo-pink"
                                >
                                  View offer
                                </a>
                              )}
                            </div>
                          )}
                          {calendarEventBudgetValue && (
                            <p className="data-mono text-xs text-dayglo-void">Budget {calendarEventBudgetValue}</p>
                          )}
                          {calendarEvent.description && (
                            <p className="text-sm text-dayglo-void">{calendarEvent.description}</p>
                          )}
                          {calendarEvent.location && (
                            <p className="text-sm text-dayglo-void">
                              Destination: {calendarEvent.location}
                            </p>
                          )}
                          {calendarEvent.startLocation && (
                            <p className="text-sm text-dayglo-void/80">
                              Starts at {calendarEvent.startLocation}
                            </p>
                          )}
                          {calendarEvent.travelSummary && (
                            <p className="text-sm font-semibold text-dayglo-void">{calendarEvent.travelSummary}</p>
                          )}
                          <div className="overflow-hidden rounded-xl border-2 border-dayglo-void shadow-hard-sm">
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
                            className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                          >
                            Open trip editor
                          </button>
                        </>
                        ) : (
                          <p className="text-sm font-semibold text-dayglo-void/70">Select an activity to see details.</p>
                        )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-dayglo-void/70">Select a day to see details.</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-dayglo-void bg-paper p-10 text-center text-dayglo-void/70 shadow-hard">
                Select or create a trip to view its calendar.
              </div>
            )}
          </section>
        ) : view === "dashboards" ? (
          <section className="space-y-6 rounded-lg border-2 border-dayglo-void bg-paper p-6 shadow-hard">
            {selectedTrip ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Trip dashboards</p>
                  <h2 className="text-2xl font-black text-dayglo-void">{selectedTrip.title}</h2>
                  <p className="text-sm font-semibold text-dayglo-void">
                    {selectedTrip.days.length} day{selectedTrip.days.length === 1 ? "" : "s"} •{" "}
                    {cityStops.ordered.length} cit{cityStops.ordered.length === 1 ? "y" : "ies"}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border-2 border-dayglo-void bg-white/80 p-4 shadow-hard-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-pink">Budget</p>
                    <h3 className="text-xl font-black text-dayglo-void">
                      {formatBudget(budgetStats.total) ?? "$0"}
                    </h3>
                    <p className="text-xs font-semibold text-dayglo-void/70">
                      {budgetStats.byCategory.length ? "By category" : "Add budgets to activities to track spend."}
                    </p>
                    <div className="mt-3 space-y-2">
                      {budgetStats.byCategory.slice(0, 4).map((bucket) => (
                        <div
                          key={bucket.category}
                          className="space-y-1 rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2"
                        >
                          <div className="flex items-center justify-between text-sm font-semibold text-dayglo-void">
                            <span>{bucket.category}</span>
                            <span>{formatBudget(bucket.value) ?? "$0"}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full border border-dayglo-void/40 bg-white">
                            <div
                              className="h-full bg-dayglo-void"
                              style={{
                                width: `${
                                  budgetStats.total ? Math.min(100, (bucket.value / budgetStats.total) * 100) : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      {!budgetStats.byCategory.length && (
                        <p className="text-xs font-semibold text-dayglo-void/70">
                          Add a budget to activities to see totals by category.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border-2 border-dayglo-void bg-white/80 p-4 shadow-hard-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-pink">Travel load</p>
                    <h3 className="text-xl font-black text-dayglo-void">
                      {formatHoursLabel(Math.round(travelStats.totalSeconds / 60))} on the move
                    </h3>
                    <p className="text-xs font-semibold text-dayglo-void/70">
                      {travelStats.totalMeters ? `${(travelStats.totalMeters / 1000).toFixed(1)} km` : "No travel logged"}
                    </p>
                    <div className="mt-3 space-y-2">
                      {topTravelDays.length ? (
                        topTravelDays.map((stat) => (
                          <div
                            key={stat.day.id}
                            className="flex items-center justify-between rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2 text-sm font-semibold text-dayglo-void"
                          >
                            <span>
                              {stat.day.city} ({format(new Date(stat.day.date), "MMM d")})
                            </span>
                            <span className="data-mono rounded-sm border border-dayglo-void bg-white px-2 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_#050505]">
                              {formatHoursLabel(Math.round(stat.durationSeconds / 60))}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs font-semibold text-dayglo-void/70">
                          Tag trains, drives, or flights to see per-day travel.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border-2 border-dayglo-void bg-white/80 p-4 shadow-hard-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-pink">Route</p>
                    <h3 className="text-xl font-black text-dayglo-void">Cities & stops</h3>
                    <p className="text-xs font-semibold text-dayglo-void/70">Chronological path</p>
                    <div className="mt-3 space-y-2">
                      {cityStops.ordered.length ? (
                        cityStops.ordered.map((stop) => (
                          <div
                            key={stop.city}
                            className="flex items-center justify-between rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2 text-sm font-semibold text-dayglo-void"
                          >
                            <div>
                              <p>{stop.city}</p>
                              <p className="text-[11px] font-semibold text-dayglo-void/70">
                                {stop.days.map((day) => format(new Date(day), "MMM d")).join(", ")}
                              </p>
                            </div>
                            <span className="data-mono rounded-sm border border-dayglo-void bg-white px-2 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_#050505]">
                              {(stop.activityCount || 0)} item{stop.activityCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs font-semibold text-dayglo-void/70">Add cities to see the route.</p>
                      )}
                    </div>
                    {cityStops.routeLink && (
                      <a
                        href={cityStops.routeLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center justify-center rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                      >
                        Open in Google Maps
                      </a>
                    )}
                  </div>

                  <div className="rounded-lg border-2 border-dayglo-void bg-white/80 p-4 shadow-hard-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-pink">Attraction coverage</p>
                    <h3 className="text-xl font-black text-dayglo-void">Are we doing the hits?</h3>
                    <p className="text-xs font-semibold text-dayglo-void/70">
                      Targeting 10 essentials per city
                    </p>
                    <div className="mt-3 space-y-2">
                      {coverageStats.byCity.length ? (
                        coverageStats.byCity.slice(0, 4).map((city) => {
                          const coveragePercent = Math.min(100, (city.planned / 10) * 100);
                          return (
                            <div
                              key={city.city}
                              className="space-y-1 rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2"
                            >
                              <div className="flex items-center justify-between text-sm font-semibold text-dayglo-void">
                                <span>{city.city}</span>
                                <span className="data-mono rounded-sm border border-dayglo-void bg-white px-2 py-0.5 text-[11px] font-black shadow-[2px_2px_0px_0px_#050505]">
                                  {city.planned}/10 planned
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full border border-dayglo-void/40 bg-white">
                                <div className="h-full bg-dayglo-void" style={{ width: `${coveragePercent}%` }} />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs font-semibold text-dayglo-void/70">
                          Add activities to gauge coverage per city.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border-2 border-dayglo-void bg-white/80 p-4 shadow-hard-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-pink">Schedule density</p>
                    <h3 className="text-xl font-black text-dayglo-void">
                      Avg {formatHoursLabel(scheduleStats.avgMinutes)} planned / day
                    </h3>
                    <p className="text-xs font-semibold text-dayglo-void/70">Based on activities with start + end times</p>
                    <div className="mt-3 space-y-2">
                      {scheduleStats.busiest && (
                        <div className="flex items-center justify-between rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2 text-sm font-semibold text-dayglo-void">
                          <span>
                            Busiest: {scheduleStats.busiest.city} ({format(new Date(scheduleStats.busiest.date), "MMM d")})
                          </span>
                          <span className="data-mono rounded-sm border border-dayglo-void bg-white px-2 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_#050505]">
                            {formatHoursLabel(
                              scheduleStats.dayStats.find((stat) => stat.day.id === scheduleStats.busiest?.id)?.minutes || 0,
                            )}
                          </span>
                        </div>
                      )}
                      {scheduleStats.lightest && (
                        <div className="flex items-center justify-between rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2 text-sm font-semibold text-dayglo-void">
                          <span>
                            Lightest: {scheduleStats.lightest.city} ({format(new Date(scheduleStats.lightest.date), "MMM d")})
                          </span>
                          <span className="data-mono rounded-sm border border-dayglo-void bg-white px-2 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_#050505]">
                            {formatHoursLabel(
                              scheduleStats.dayStats.find((stat) => stat.day.id === scheduleStats.lightest?.id)?.minutes || 0,
                            )}
                          </span>
                        </div>
                      )}
                      {!scheduleStats.dayStats.length && (
                        <p className="text-xs font-semibold text-dayglo-void/70">
                          Add start/end times to see pacing per day.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border-2 border-dayglo-void bg-white/80 p-4 shadow-hard-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-pink">Lodging readiness</p>
                    <h3 className="text-xl font-black text-dayglo-void">
                      {lodgingStats.nightsPlanned}/{selectedTrip.days.length} nights covered
                    </h3>
                    <p className="text-xs font-semibold text-dayglo-void/70">Counts days with a hotel entry</p>
                    <div className="mt-3 space-y-2">
                      {lodgingStats.missing.length ? (
                        lodgingStats.missing.slice(0, 4).map((day) => (
                          <div
                            key={day.id}
                            className="flex items-center justify-between rounded-md border border-dayglo-void/40 bg-dayglo-yellow/20 px-3 py-2 text-sm font-semibold text-dayglo-void"
                          >
                            <span>
                              {day.city} ({format(new Date(day.date), "MMM d")})
                            </span>
                            <span className="data-mono rounded-sm border border-dayglo-void bg-white px-2 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_#050505]">
                              Missing
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs font-semibold text-dayglo-void/70">All days have lodging.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-dayglo-void bg-dayglo-yellow/40 p-8 text-center text-dayglo-void shadow-hard">
                Select a trip to see dashboards.
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
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
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
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                          placeholder="Morning wander, afternoon train, late dinner"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingDay}
                        title="Save this day's city and notes"
                        className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-wait disabled:opacity-60"
                      >
                        {savingDay ? "Saving..." : "Save day"}
                      </button>
                    </form>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Trip editor</p>
                        {orderedActivities.length ? (
                          <ol className="space-y-2">
                            {orderedActivities.map((activity) => {
                              const hotelMeta = getHotelMetadata(activity);
                              const budgetValue = getActivityBudgetValue(activity);
                              return (
                                <li
                                  key={activity.id}
                                  className="rounded-lg border-2 border-dayglo-void bg-white px-4 py-3 shadow-hard transition hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#FF00FF]"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <p className="text-base font-black text-dayglo-void">{activity.title}</p>
                                        {hotelMeta && (
                                          <span className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.25em] text-dayglo-void shadow-hard-sm">
                                            Hotel
                                          </span>
                                        )}
                                      </div>
                                      <span className="inline-flex items-center gap-1 rounded-md border-2 border-dayglo-void bg-dayglo-pink px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.3em] text-dayglo-void shadow-hard-sm">
                                        {formatTimeRange(activity)}
                                      </span>
                                      {hotelMeta?.nights && (
                                        <p className="text-xs font-semibold text-dayglo-void">{hotelMeta.nights} night{hotelMeta.nights === 1 ? "" : "s"}</p>
                                      )}
                                      {activity.description && (
                                        <p className="text-xs text-dayglo-void">{activity.description}</p>
                                      )}
                                      {activity.location && (
                                        <p className="text-xs text-dayglo-void">{activity.location}</p>
                                      )}
                                      {activity.startLocation && (
                                        <p className="text-xs text-dayglo-void/70">Starts at {activity.startLocation}</p>
                                      )}
                                      {activity.travelSummary && (
                                        <p className="text-xs font-semibold text-dayglo-void">{activity.travelSummary}</p>
                                      )}
                                      {budgetValue !== null && (
                                        <p className="data-mono text-xs text-dayglo-void">
                                          Budget {formatBudget(budgetValue)}
                                        </p>
                                      )}
                                      {activity.startLocation && activity.location && (
                                        <a
                                          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                                            activity.startLocation,
                                          )}&destination=${encodeURIComponent(activity.location)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs font-black text-dayglo-cyan underline hover:text-dayglo-pink"
                                        >
                                          Open route in Google Maps
                                        </a>
                                      )}
                                    </div>
                                    <div className="flex gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void">
                                      <button
                                        type="button"
                                        onClick={() => handleEditActivity(activity)}
                                        className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-2 py-1 shadow-hard-sm transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteActivity(activity.id)}
                                        className="rounded-md border-2 border-dayglo-void bg-dayglo-orange px-2 py-1 text-dayglo-void shadow-hard-sm transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
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
                          <label
                            className="flex items-center gap-1 text-[11px] text-slate-600"
                            title="Use AI to predict this activity"
                          >
                            <input
                              type="checkbox"
                              checked={titleSuggestEnabled}
                              onChange={(event) => setTitleSuggestEnabled(event.target.checked)}
                              className="h-3 w-3 rounded border-[#f5d9ff] text-fuchsia-500 focus:ring-0"
                            />
                            Predict activity
                          </label>
                          <button
                            type="button"
                            onClick={() => activityUploadInputRef.current?.click()}
                            title="Upload a screenshot from your email and auto-populate details"
                            className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-2 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard-sm transition hover:bg-dayglo-yellow hover:translate-y-[1px] hover:shadow-none"
                            disabled={activityUploadLoading}
                          >
                            {activityUploadLoading ? "Scanning..." : "Upload screenshot"}
                          </button>
                        </div>
                        <input
                          id="activityTitle"
                          required
                          value={activityForm.title}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, title: e.target.value }))}
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
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
                        <input
                          ref={activityUploadInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={handleActivityUploadChange}
                        />
                        {activityUploadError && (
                          <p className="text-[11px] text-rose-500">{activityUploadError}</p>
                        )}
                        <p className="text-[11px] text-dayglo-void/70">
                          Tip: Snap a confirmation screenshot to auto-fill the form.
                        </p>
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
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
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
                              className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                            />
                          </div>
                        </div>
                      {selectedTrip && (
                        <div>
                          <label className="text-xs text-fuchsia-500" htmlFor="activityDay">
                            Day
                          </label>
                          <select
                            id="activityDay"
                            value={activityDayId ?? selectedDay?.id ?? ""}
                            onChange={(event) => setActivityDayId(event.target.value || null)}
                            className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                          >
                            {selectedTrip.days.map((day) => (
                              <option key={day.id} value={day.id}>
                                {format(new Date(day.date), "EEE, MMM d")} — {day.city}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
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
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
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
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
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
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                          placeholder="Hotel de Ville"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-fuchsia-500" htmlFor="activityBudget">
                          Budget (optional)
                        </label>
                        <input
                          id="activityBudget"
                          type="number"
                          min="0"
                          step="0.01"
                          value={activityForm.budget}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, budget: e.target.value }))}
                          className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-white px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                          placeholder="e.g. 120"
                        />
                      </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={savingActivity}
                            title="Add this activity to the day"
                            className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-wait disabled:opacity-60"
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
                              title="Stop editing and reset the form"
                              className="rounded-md border-2 border-dayglo-void bg-dayglo-orange px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {hotelActivities.length > 0 && (
                      <div className="space-y-2 rounded-lg border-2 border-dayglo-void bg-paper p-3 shadow-hard">
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">Hotel stays</p>
                        <ul className="space-y-2 text-sm text-dayglo-void">
                          {hotelActivities.map((activity) => {
                            const meta = getHotelMetadata(activity);
                            return (
                              <li key={activity.id} className="rounded-lg border-2 border-dayglo-void bg-white px-3 py-2 shadow-hard-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-black text-dayglo-void">{activity.title}</p>
                                    <span className="data-mono inline-flex items-center border border-dayglo-void bg-dayglo-pink px-2 py-0.5 text-xs font-bold text-dayglo-void shadow-[2px_2px_0px_0px_#050505]">
                                      {formatTimeRange(activity)}
                                    </span>
                                    {meta?.nights && (
                                      <p className="text-xs font-semibold text-dayglo-void">{meta.nights} night{meta.nights === 1 ? "" : "s"}</p>
                                    )}
                                    {activity.location && (
                                      <p className="text-xs text-dayglo-void">{activity.location}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 text-[11px] font-black uppercase tracking-[0.2em] text-dayglo-void">
                                    {meta?.price && meta?.currency && (
                                      <span className="rounded-md border-2 border-dayglo-void bg-dayglo-lime px-2 py-0.5 text-dayglo-void shadow-hard-sm">
                                        {meta.price.toFixed(0)} {meta.currency}
                                      </span>
                                    )}
                                    {meta?.offer && (
                                      <a
                                        href={meta.offer}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-2 py-0.5 text-dayglo-void shadow-hard-sm transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
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
                      <div className="space-y-2 rounded-lg border-2 border-dayglo-void bg-paper p-3 shadow-hard">
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-dayglo-pink">City map</p>
                        <div className="overflow-hidden rounded-xl border-2 border-dayglo-void shadow-hard-sm" style={{ filter: "grayscale(100%) contrast(110%)" }}>
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
                        <div className="flex flex-col gap-1 text-sm text-dayglo-void md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-black text-dayglo-void">{selectedDayPlace.description}</p>
                            <p className="text-xs font-semibold text-dayglo-void/70">
                              {selectedDayPlace.lat.toFixed(3)}, {selectedDayPlace.lng.toFixed(3)}
                            </p>
                          </div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedDayPlace.lat},${selectedDayPlace.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-4 py-1 text-xs font-black uppercase tracking-[0.3em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
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
                            title="Fetch live hotels near this city"
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
                                      title="Add this hotel stay to your plan"
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
                                  title="Load more hotel results"
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
                className={`sticky top-8 flex h-[calc(100vh-6rem)] w-full flex-col rounded-lg border-2 border-dayglo-void bg-dayglo-yellow/40 p-6 shadow-hard ${
                  chatExpanded ? "" : ""
                }`}
              >
                {chatPanelContent}
              </aside>
            ) : (
              <aside className="sticky top-8 flex h-[calc(100vh-6rem)] flex-col items-center justify-center gap-4 rounded-lg border-2 border-dayglo-void bg-dayglo-yellow/60 p-6 text-center text-dayglo-void shadow-hard">
                <p className="text-sm font-black uppercase tracking-[0.2em]">Need ideas or timing help?</p>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="rounded-md border-2 border-dayglo-void bg-dayglo-cyan px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none"
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
