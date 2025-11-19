import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateRequest, AuthError } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

const requestSchema = z.object({
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  data: z.string().min(1),
});

const extractionSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    notes: { type: "string" },
    location: { type: "string" },
    startLocation: { type: "string" },
    type: { type: "string" },
    startTime: { type: "string" },
    endTime: { type: "string" },
    budget: { type: "number" },
  },
} satisfies Record<string, unknown>;

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!serverEnv.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
    }

    const mimeType = parsed.data.mimeType || "application/octet-stream";
    const dataUrl = `data:${mimeType};base64,${parsed.data.data}`;

    const prompt = `Extract trip activity details from this confirmation. Return valid JSON matching this schema:
{"title":"string","notes":"string","location":"string","startLocation":"string","type":"string","startTime":"HH:MM","endTime":"HH:MM","budget":number}
Use 24-hour HH:MM times. Omit fields you cannot find by setting them to empty strings. Title should be short.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: serverEnv.OPENAI_MODEL,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fonda_activity_extract",
            schema: extractionSchema,
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are Fonda, a travel-planning copilot. Extract structured data from confirmations and respond with JSON only.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI vision request failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const jsonText = Array.isArray(content)
      ? content.map((chunk: { type?: string; text?: string }) => chunk.text || "").join("\n")
      : content;

    let activity = {} as Record<string, unknown>;
    try {
      activity = JSON.parse(jsonText || "{}");
    } catch (error) {
      console.error("Failed to parse AI extraction", error, jsonText);
    }

    return NextResponse.json({ activity });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Failed to process activity upload", error);
    return NextResponse.json({ error: "Failed to analyze document" }, { status: 500 });
  }
}
