"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = status === "ready" && Boolean(user && idToken);

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
