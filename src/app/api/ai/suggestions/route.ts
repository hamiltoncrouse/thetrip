import { NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";

const suggestionSchema = z.object({
  city: z.string().min(1),
  day: z.string().optional(),
  interests: z.array(z.string()).optional(),
  message: z.string().optional(),
  tripContext: z.string().optional(),
});

type Suggestion = {
  title: string;
  description: string;
  suggestedTime?: string;
  url?: string;
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
          url: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
  },
  required: ["suggestions"],
} satisfies Record<string, unknown>;

function buildPrompt(
  city: string,
  day?: string,
  interests: string[] = [],
  message?: string,
  tripContext?: string,
) {
  const interestsLine = interests.length ? interests.join(", ") : "surprise me";
  const requestLine = message?.trim() || interestsLine;
  const dayLine = day ? `The date is ${day}.` : "The traveler didn't specify a date.";
  const contextLine = tripContext?.trim()
    ? `Trip context: ${tripContext.trim()}.`
    : "Trip context is unknown.";
  return `You are Fonda, a travel-planning copilot. The traveler is in ${city}. ${dayLine} ${contextLine}
User request: "${requestLine}".
- If they ask about a specific place or a prior suggestion (e.g., hours, location, booking), answer directly with concise specifics.
- Otherwise, propose 1-3 vivid, realistic options that fit their itinerary and cities mentioned, avoiding duplicates of what they already have.
- Keep each suggestion punchy (ideally one sentence) and actionable.
Include an official URL when available (booking/info page). Return STRICT JSON matching this schema (no prose): {"suggestions":[{"title":"string","description":"string","suggestedTime":"HH:MM","url":"string"}]}
Suggestions can be direct answers (title = subject, description = the answer). Use 24-hour times for hours when possible.`;
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

async function fetchGeminiSuggestions(
  city: string,
  day?: string,
  interests: string[] = [],
  message?: string,
  tripContext?: string,
) {
  if (!serverEnv.GEMINI_API_KEY) return [];
  const prompt = buildPrompt(city, day, interests, message, tripContext);
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

async function fetchOpenAISuggestions(
  city: string,
  day?: string,
  interests: string[] = [],
  message?: string,
  tripContext?: string,
) {
  if (!serverEnv.OPENAI_API_KEY) return [];
  const prompt = buildPrompt(city, day, interests, message, tripContext);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_MODEL,
      temperature: 0.6,
      max_tokens: 600,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fonda_suggestions",
          schema: responseSchema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You are Fonda, a travel-planning copilot. Always respond with valid JSON matching the provided schema.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part: { type?: string; text?: string }) => part.text || "").join("\n")
    : content;
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

  const { city, day, interests = [], message, tripContext } = parsed.data;

  let items: Suggestion[] = [];
  let source: "gemini" | "openai" | "placeholder" | "error" = "placeholder";
  let errorMessage: string | undefined;

  try {
    const geminiSuggestions = await fetchGeminiSuggestions(city, day, interests, message, tripContext);
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
    try {
      const openaiSuggestions = await fetchOpenAISuggestions(city, day, interests, message, tripContext);
      if (openaiSuggestions.length) {
        items = openaiSuggestions;
        source = "openai";
      }
    } catch (error) {
      console.error("OpenAI suggestions failed", error);
      source = "error";
      const message = error instanceof Error ? error.message : "Unknown OpenAI error";
      errorMessage = errorMessage ? `${errorMessage}; ${message}` : message;
    }
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
    if (source !== "error") {
      source = "placeholder";
    }
  }

  return NextResponse.json({ city, day, items, source, error: errorMessage });
}
