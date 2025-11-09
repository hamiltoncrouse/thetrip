import Link from "next/link";
import { clientEnv } from "@/lib/env";

const features = [
  {
    title: "AI Itinerary Drafts",
    description: "Generate city-aware activity plans via Gemini, then drag-and-drop them into your calendar.",
  },
  {
    title: "Travel Time Dashboard",
    description: "Auto-calc drive/train windows so you never stack impossible transfers again.",
  },
  {
    title: "Hotel Intelligence",
    description: "Ping live hotel APIs with your budget and pin results directly onto a day.",
  },
  {
    title: "Chat Copilot",
    description: "Ask anything about your route and let The Trip add activities straight from the chat pane.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24 pt-24">
        <header className="space-y-6 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">{clientEnv.NEXT_PUBLIC_APP_NAME}</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Plan your France adventure with AI that respects your vibe
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-300">
            The Trip stitches together Gemini suggestions, live travel data, and hotel intel so you can
            architect a cinematic itinerary without spreadsheet gymnastics.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-slate-100 px-8 py-3 text-slate-900 transition hover:bg-white"
            >
              Launch Planner
            </Link>
            <a
              href="https://france.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-slate-700 px-8 py-3 text-slate-100 transition hover:border-slate-500"
            >
              View Concept
            </a>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-white/5 bg-white/5 p-6 shadow-2xl">
              <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-slate-300">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/5 bg-gradient-to-br from-slate-900 to-slate-800 p-8 shadow-2xl">
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
