import { NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";

const suggestionSchema = z.object({
  city: z.string().min(1),
  day: z.string().optional(),
  interests: z.array(z.string()).optional(),
});

type Suggestion = {
  title: string;
  description: string;
  suggestedTime?: string;
};

const responseSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          suggestedTime: { type: "string" },
        },
        required: ["title", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

function buildPrompt(city: string, day?: string, interests: string[] = []) {
  const interestsLine = interests.length ? interests.join(", ") : "surprise me";
  const dayLine = day ? `The date is ${day}.` : "The traveler didn't specify a date.";
  return `You are Fonda, a travel-planning copilot. Suggest vivid, specific activities or experiences in ${city}.
${dayLine} They are interested in ${interestsLine}.
Return STRICT JSON matching this schema (no prose): {"suggestions":[{"title":"string","description":"string","suggestedTime":"HH:MM"}]}
Focus on realistic plans you could add to an itinerary.`;
}

function parseSuggestions(content?: string): Suggestion[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as Suggestion[];
    if (Array.isArray(parsed?.suggestions)) return parsed.suggestions as Suggestion[];
  } catch (error) {
    console.warn("Failed to parse Gemini suggestions as JSON", error);
  }
  return [];
}

async function fetchGeminiSuggestions(city: string, day?: string, interests: string[] = []) {
  if (!serverEnv.GEMINI_API_KEY) return [];
  const prompt = buildPrompt(city, day, interests);
  const url = new URL(
    `/v1beta/models/${serverEnv.GEMINI_MODEL}:generateContent`,
    "https://generativelanguage.googleapis.com",
  );
  url.searchParams.set("key", serverEnv.GEMINI_API_KEY);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseSuggestions(text);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = suggestionSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { city, day, interests = [] } = parsed.data;

  let items: Suggestion[] = [];
  let source: "gemini" | "placeholder" | "error" = "placeholder";
  let errorMessage: string | undefined;
  try {
    const geminiSuggestions = await fetchGeminiSuggestions(city, day, interests);
    if (geminiSuggestions.length) {
      items = geminiSuggestions;
      source = "gemini";
    }
  } catch (error) {
    console.error("Gemini suggestions failed", error);
    source = "error";
    errorMessage = error instanceof Error ? error.message : "Unknown Gemini error";
  }

  if (!items.length) {
    items = [
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
  }

  return NextResponse.json({ city, day, items, source, error: errorMessage });
}
