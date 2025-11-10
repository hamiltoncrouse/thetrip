import Link from "next/link";
import { clientEnv } from "@/lib/env";

const features = [
  {
    title: "Neon Route Generator",
    emoji: "🌌",
    description: "Gemini riffs on your vibe, time of day, and favorite arrondissement to sketch cinematic days in seconds.",
  },
  {
    title: "Trance Travel Timing",
    emoji: "🚀",
    description: "Psychedelic dashboards warn when train transfers get sketchy and suggest smoother departure windows.",
  },
  {
    title: "Hotel Mood Board",
    emoji: "🛎️",
    description: "Tap into live Amadeus + Booking data, filtered by budget and proximity to the scenes you’re chasing.",
  },
  {
    title: "Groovy Copilot",
    emoji: "🌀",
    description: "Chat with a helper that remembers your entire trip, then injects activities directly onto the calendar.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen text-slate-100">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24 pt-24">
        <div className="absolute left-1/2 top-4 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,71,218,0.4),transparent_60%)] blur-3xl" />
        <header className="space-y-6 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-300">{clientEnv.NEXT_PUBLIC_APP_NAME}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow-[0_10px_35px_rgba(255,71,218,0.35)] sm:text-6xl">
            “The Trip” inspired planner for the most vivid France adventure of your life
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-200">
            Neon gradients, AI riffs, and live data stitch together an itinerary that feels like Peter Fonda cruising
            down the Riviera at midnight.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/dashboard" className="psychedelic-button inline-flex items-center justify-center rounded-full px-8 py-3">
              Launch The Trip Planner
            </Link>
            <a
              href="https://en.wikipedia.org/wiki/The_Trip_(1967_film)"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-white/30 px-8 py-3 text-slate-100 transition hover:border-white"
            >
              Learn the cult inspiration
            </a>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="psychedelic-card rounded-2xl p-6">
              <div className="flex items-center gap-3 text-2xl">
                <span>{feature.emoji}</span>
                <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
              </div>
              <p className="mt-2 text-sm text-slate-200">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/5 bg-gradient-to-br from-[#2b0351]/80 to-[#06021f]/90 p-8 shadow-2xl">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Stack Preview</p>
            <h2 className="text-2xl font-semibold text-white">Render + Postgres + Gemini ready</h2>
            <p className="text-slate-300">
              This repo already speaks the same language as your IdealHome deployment: Prisma for schema
              management, Next.js Route Handlers as the secure API surface, and a Gemini proxy pattern that keeps
              secrets server-side on Render.
            </p>
          </div>
          <dl className="mt-8 grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Default Home Base</dt>
              <dd className="text-white">{clientEnv.NEXT_PUBLIC_DEFAULT_HOME_CITY}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Database</dt>
              <dd className="text-white">Managed Postgres via Prisma</dd>
            </div>
            <div>
              <dt className="text-slate-500">AI Providers</dt>
              <dd className="text-white">Gemini (primary), OpenAI optional</dd>
            </div>
            <div>
              <dt className="text-slate-500">Deploy Target</dt>
              <dd className="text-white">Render Web Service + cron hooks</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
