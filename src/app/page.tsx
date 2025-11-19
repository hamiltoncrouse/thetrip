import Link from "next/link";
import { clientEnv } from "@/lib/env";

const manifestoCards = [
  {
    title: "VISUALS > CELLS",
    body:
      "Stop pasting reservation numbers into Excel. We hold your tickets, confirmations, and addresses in a visual timeline that actually looks like your trip feels.",
  },
  {
    title: "ASK FONDA",
    body:
      "Meet your neon-soaked travel consultant. Stuck on where to eat? Need a route fix? Fonda riffs on your itinerary to find hidden gems and vibe-matched spots instantly.",
  },
  {
    title: "HIVE MIND",
    body:
      "Planning solo is boring. Share the link. Let friends vote on spots. Keep everyone on the same wavelength without the endless \"Reply-All\" email chains.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper text-dayglo-void">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
        <header className="space-y-4 text-center">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-dayglo-pink">{clientEnv.NEXT_PUBLIC_APP_NAME}</p>
          <h1 className="text-5xl font-black uppercase text-dayglo-void sm:text-6xl">KILL THE SPREADSHEET.</h1>
          <h2 className="mx-auto max-w-3xl text-lg font-semibold uppercase text-dayglo-void">
            Travel is a vibe, not a grid of cells. Plan visually, route intelligently, and keep the chaos under control.
          </h2>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <ActionCard
            href="/dashboard"
            label="START A NEW TRIP"
            subtext="Drop a pin. Pick a date. Go."
            accent="bg-dayglo-lime"
          />
          <ActionCard
            href="/dashboard"
            label="JUMP BACK IN"
            subtext="Resume planning where you left off."
            accent="bg-dayglo-cyan"
          />
          <ActionCard
            href="/dashboard"
            label="THE TIMELINE"
            subtext="Bird’s eye view of your logistics."
            accent="bg-dayglo-pink"
          />
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {manifestoCards.map((card) => (
            <article key={card.title} className="rounded-lg border-2 border-dayglo-void bg-white p-5 shadow-hard">
              <h3 className="text-xl font-black uppercase text-dayglo-void">{card.title}</h3>
              <p className="data-mono mt-3 text-sm text-dayglo-void">{card.body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  label,
  subtext,
  accent,
}: {
  href: string;
  label: string;
  subtext: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col justify-between rounded-lg border-2 border-dayglo-void bg-paper p-5 shadow-hard transition hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#050505]`}
    >
      <span className={`inline-flex w-fit rounded-md border-2 border-dayglo-void px-3 py-1 text-xs font-black uppercase tracking-[0.3em] text-dayglo-void ${accent}`}>
        {label}
      </span>
      <p className="data-mono mt-4 text-sm text-dayglo-void">{subtext}</p>
    </Link>
  );
}
