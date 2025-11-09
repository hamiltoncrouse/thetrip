import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

const suggestionSchema = z.object({
  city: z.string().min(1),
  day: z.string().optional(),
  interests: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = suggestionSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (!serverEnv.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Gemini is not configured yet." },
      { status: 503 },
    );
  }

  const { city, day, interests = [] } = parsed.data;

  // Placeholder response until Gemini proxy is wired up.
  const items = [
    {
      title: `Stroll through ${city}`,
      description: "Discover key landmarks with a self-guided walk.",
      suggestedTime: "10:00",
    },
    {
      title: "Local dining",
      description: `Book a table inspired by your interests: ${interests.join(", ") || "food"}.`,
      suggestedTime: "19:30",
    },
  ];

  return NextResponse.json({
    city,
    day,
    items,
    source: "placeholder",
  });
}
