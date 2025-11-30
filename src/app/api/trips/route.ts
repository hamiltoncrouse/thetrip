import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, AuthError } from "@/lib/auth";

const createTripSchema = z.object({
  title: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  homeCity: z.string().optional(),
  description: z.string().optional(),
  profileId: z.string().optional(),
  profile: z.record(z.string(), z.any()).optional(),
});

const DEFAULT_CITY = "Paris";

function toNoonUtc(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(12, 0, 0, 0);
  return copy;
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : toNoonUtc(date);
}

function buildDayEntries(startDate?: string, endDate?: string, city?: string) {
  const parsedStart = normalizeDate(startDate);
  const parsedEnd = normalizeDate(endDate);

  // Fall back to whichever date we have, and finally to "today" so new trips always have at least one day.
  const rangeStart = parsedStart ?? parsedEnd ?? toNoonUtc(new Date());
  const rangeEnd = parsedEnd ?? parsedStart ?? rangeStart;
  const dayCity = city || DEFAULT_CITY;

  const days = [] as { date: Date; city: string }[];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    days.push({ date: toNoonUtc(cursor), city: dayCity });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

async function ensureActivityBudgetColumn() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "budget" DECIMAL(10, 2);',
    );
  } catch (error) {
    console.error("Failed to ensure activity budget column", error);
  }
}

export async function GET(request: Request) {
  try {
    const { account } = await authenticateRequest(request);
    await ensureActivityBudgetColumn();
    const trips = await prisma.trip.findMany({
      where: {
        OR: [{ userId: account.id }, { collaborators: { some: { email: account.email } } }],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        collaborators: true,
        days: {
          orderBy: { date: "asc" },
          include: {
            activities: { orderBy: { startTime: "asc" } },
            travelSegments: true,
            hotels: true,
          },
        },
      },
    });

    return NextResponse.json({
      trips,
      user: {
        id: account.id,
        credits: account.credits,
        displayName: account.displayName,
        email: account.email,
        savedProfiles: account.savedProfiles ?? [],
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error fetching trips", error);
    return NextResponse.json({ error: "Failed to load trips." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { account } = await authenticateRequest(req);
    await ensureActivityBudgetColumn();
    const json = await req.json();
    const parsed = createTripSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, description, startDate, endDate, homeCity, profile, profileId } = parsed.data;

    const dayEntries = buildDayEntries(startDate, endDate, homeCity);

    const trip = await prisma.trip.create({
      data: {
        title,
        description,
        homeCity,
        startDate: startDate ? normalizeDate(startDate) : null,
        endDate: endDate ? normalizeDate(endDate) : null,
        userId: account.id,
        profile: profile ?? null,
        profileId: profileId ?? null,
        days: {
          create: dayEntries,
        },
      },
      include: {
        days: {
          orderBy: { date: "asc" },
          include: { activities: { orderBy: { startTime: "asc" } } },
        },
      },
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error creating trip", error);
    return NextResponse.json({ error: "Failed to create trip." }, { status: 500 });
  }
}
