"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { clientEnv } from "@/lib/env";

export default function StartTripPage() {
  const router = useRouter();
  const { user, idToken, status, firebaseConfigured, signInWithGoogle } = useAuth();
  const [form, setForm] = useState({
    title: "",
    homeCity: clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY,
    startDate: "",
    endDate: "",
    description: "",
  });
  const [profileEnabled, setProfileEnabled] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "Trip profile",
    travelerType: "",
    budget: "",
    pace: "",
    goals: "",
    mobility: "",
    preferences: { culture: 60, food: 60, active: 40, nightlife: 20, shopping: 20, relax: 30 },
    keywords: [] as string[],
  });
  const [profileKeywordsInput, setProfileKeywordsInput] = useState("");
  const [savedProfiles, setSavedProfiles] = useState<
    Array<{
      id?: string;
      name: string;
      travelerType?: string;
      budget?: string;
      pace?: string;
      goals?: string;
      mobility?: string;
      preferences?: Record<string, number>;
      keywords?: string[];
    }>
  >([]);

  const normalizeKeywords = (raw: string | string[] | undefined | null) => {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : raw.split(/[,;]+/);
    return arr
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 10);
  };
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = status === "ready" && Boolean(user && idToken);

  useEffect(() => {
    if (!isReady || !idToken) return;
    async function fetchProfiles() {
      try {
        const res = await fetch("/api/profiles", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setSavedProfiles(data.profiles || []);
      } catch (error) {
        console.warn("Failed to load saved profiles", error);
      }
    }
    fetchProfiles();
  }, [idToken, isReady]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isReady || !idToken) {
      setError("Sign in to create a trip.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: form.title,
          homeCity: form.homeCity || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          description: form.description || undefined,
          profileId: profileEnabled ? selectedProfileId || undefined : undefined,
          profile: profileEnabled
            ? {
                name: profileForm.name || "Trip profile",
                travelerType: profileForm.travelerType || undefined,
                budget: profileForm.budget || undefined,
                pace: profileForm.pace || undefined,
                goals: profileForm.goals || undefined,
                mobility: profileForm.mobility || undefined,
                preferences: profileForm.preferences,
                keywords: profileForm.keywords?.slice(0, 10) || undefined,
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to create trip");
      }
      const data = await res.json();
      router.push(`/dashboard?tripId=${data.trip?.id ?? ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-dayglo-void">
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <header className="space-y-2 text-center">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-dayglo-pink">Trip Wizard</p>
          <h1 className="text-4xl font-black uppercase">Kick off a new mission</h1>
          <p className="text-sm text-dayglo-void/80">Drop the basics. We’ll spin up the timeline for you.</p>
        </header>

        {!firebaseConfigured && (
          <p className="mt-8 rounded-lg border-2 border-dayglo-void bg-white p-4 text-sm font-semibold text-dayglo-void">
            Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* env vars to enable auth.
          </p>
        )}

        {!isReady ? (
          <div className="mt-10 rounded-lg border-2 border-dayglo-void bg-white p-6 text-center shadow-hard">
            <p className="text-sm font-semibold">Sign in to create your first trip.</p>
            <button
              type="button"
              onClick={() => signInWithGoogle().catch((err) => setError(err.message))}
              disabled={!firebaseConfigured || status === "loading"}
              className="mt-4 rounded-md border-2 border-dayglo-void bg-dayglo-lime px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed"
            >
              Sign in with Google
            </button>
            {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-4 rounded-lg border-2 border-dayglo-void bg-white p-6 shadow-hard">
            {error && <p className="rounded-md border-2 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div>
              <label className="text-xs font-black uppercase" htmlFor="title">
                Trip title
              </label>
              <input
                id="title"
                required
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                placeholder="Night Markets + Blue Hours"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase" htmlFor="homeCity">
                Base city
              </label>
              <input
                id="homeCity"
                value={form.homeCity}
                onChange={(event) => setForm((prev) => ({ ...prev, homeCity: event.target.value }))}
                className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase" htmlFor="startDate">
                  Start date
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase" htmlFor="endDate">
                  End date
                </label>
                <input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-black uppercase" htmlFor="description">
                Notes / intent
              </label>
              <textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1 w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                placeholder="Night trains, rooftop noodle stops, sunrise swims"
              />
            </div>
              <div className="rounded-lg border-2 border-dayglo-void bg-dayglo-yellow/15 p-4 shadow-hard-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-dayglo-pink">Travel profile (optional)</p>
                    <p className="text-sm font-semibold text-dayglo-void">
                      Helps Fonda tailor suggestions for this trip (you can edit later).
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-dayglo-void">
                  <input
                    type="checkbox"
                    checked={profileEnabled}
                    onChange={(e) => setProfileEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-dayglo-void text-dayglo-void"
                  />
                  Add profile
                </label>
              </div>
              {profileEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-black uppercase" htmlFor="savedProfile">
                      Use saved profile
                    </label>
                    <select
                      id="savedProfile"
                      value={selectedProfileId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedProfileId(id);
                        const found = savedProfiles.find((p) => (p.id || p.name) === id);
                        if (found) {
                          setProfileForm((prev) => ({
                            ...prev,
                            ...found,
                            preferences: { ...prev.preferences, ...(found.preferences || {}) },
                            keywords: normalizeKeywords(found.keywords),
                          }));
                          setProfileKeywordsInput((found.keywords || []).join(", "));
                        }
                      }}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                    >
                      <option value="">Skip / Custom</option>
                      {savedProfiles.map((profile) => (
                        <option key={profile.id || profile.name} value={profile.id || profile.name}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="profileName">
                      Profile name
                    </label>
                    <input
                      id="profileName"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                      placeholder="e.g., Couple culture trip"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="travelerType">
                      Traveler type
                    </label>
                    <select
                      id="travelerType"
                      value={profileForm.travelerType}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, travelerType: e.target.value }))}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                    >
                      <option value="">Skip</option>
                      <option value="solo">Solo</option>
                      <option value="couple">Couple</option>
                      <option value="friends">Friends</option>
                      <option value="family">Family</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="budget">
                      Budget
                    </label>
                    <select
                      id="budget"
                      value={profileForm.budget}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, budget: e.target.value }))}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                    >
                      <option value="">Skip</option>
                      <option value="value">Value</option>
                      <option value="mid">Mid</option>
                      <option value="luxe">Luxury</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="pace">
                      Pace
                    </label>
                    <select
                      id="pace"
                      value={profileForm.pace}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, pace: e.target.value }))}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                    >
                      <option value="">Skip</option>
                      <option value="chill">Chill</option>
                      <option value="balanced">Balanced</option>
                      <option value="packed">Packed</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-black uppercase">Preferences (0–100)</label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        ["culture", "Culture/History"],
                        ["food", "Food/Drink"],
                        ["active", "Outdoors/Active"],
                        ["nightlife", "Nightlife/Music"],
                        ["shopping", "Shopping/Design"],
                        ["relax", "Relax/Wellness"],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-2 rounded-md border border-dayglo-void/30 bg-white px-3 py-1 text-xs font-semibold text-dayglo-void">
                          <span>{label}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={profileForm.preferences[key as keyof typeof profileForm.preferences]}
                            onChange={(e) =>
                              setProfileForm((prev) => ({
                                ...prev,
                                preferences: {
                                  ...prev.preferences,
                                  [key]: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-16 rounded border border-dayglo-void/40 px-1 py-0.5 text-right text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="mobility">
                      Constraints / dietary / mobility
                    </label>
                    <input
                      id="mobility"
                      value={profileForm.mobility}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, mobility: e.target.value }))}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                      placeholder="e.g., Limited walking, gluten free, avoid late nights"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="goals">
                      Goals / vibe
                    </label>
                    <textarea
                      id="goals"
                      rows={2}
                      value={profileForm.goals}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, goals: e.target.value }))}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                      placeholder="e.g., Culture-forward, a bit of hiking, keep dinners special"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-black uppercase" htmlFor="keywords">
                      Keywords (max 10)
                    </label>
                    <input
                      id="keywords"
                      value={profileKeywordsInput}
                      onChange={(e) => {
                        setProfileKeywordsInput(e.target.value);
                        setProfileForm((prev) => ({
                          ...prev,
                          keywords: normalizeKeywords(e.target.value),
                        }));
                      }}
                      className="w-full rounded-md border-2 border-dayglo-void bg-paper px-3 py-2 text-sm font-semibold text-dayglo-void shadow-hard-sm outline-none transition focus:shadow-hard"
                      placeholder="e.g., Jazz, football, antiques, craft beer, galleries"
                    />
                  </div>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md border-2 border-dayglo-void bg-dayglo-lime py-3 text-sm font-black uppercase tracking-[0.2em] text-dayglo-void shadow-hard transition hover:bg-dayglo-yellow hover:translate-y-[2px] hover:shadow-none disabled:cursor-wait"
            >
              {loading ? "Creating..." : "Create trip"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
