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
});

const demoIdentitySchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const DEMO_HEADER = "x-trip-demo-user";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function resolveAccount(request: Request) {
  try {
    return await authenticateRequest(request);
  } catch (error) {
    if (!(error instanceof AuthError) || error.status !== 401) {
      throw error;
    }

    const header = request.headers.get(DEMO_HEADER);
    if (!header) {
      throw error;
    }

    let payload;
    try {
      payload = JSON.parse(header);
    } catch {
      throw new AuthError(401, "Invalid demo user payload.");
    }

    const parsed = demoIdentitySchema.safeParse(payload);
    if (!parsed.success) {
      throw new AuthError(401, "Invalid demo user payload.");
    }

    const { id, name, email } = parsed.data;
    const baseId = id?.trim() || slugify(name || email || "guest");
    if (!baseId) {
      throw new AuthError(401, "Demo user identifier missing.");
    }
    const demoId = baseId.startsWith("demo-") ? baseId : `demo-${baseId}`;
    const demoEmail = email?.trim() || `${demoId}@demo.thetrip`;

    const account = await prisma.user.upsert({
      where: { id: demoId },
      update: {
        email: demoEmail,
        displayName: name || null,
      },
      create: {
        id: demoId,
        email: demoEmail,
        displayName: name || null,
      },
    });

    return { account };
  }
}

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { account } = await resolveAccount(request);
    const trips = await prisma.trip.findMany({
      where: { userId: account.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        days: {
          orderBy: { date: "asc" },
          include: {
            activities: true,
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
    const { account } = await resolveAccount(req);
    const json = await req.json();
  const parsed = createTripSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

    const { title, description, startDate, endDate, homeCity } = parsed.data;

    const trip = await prisma.trip.create({
      data: {
        title,
        description,
        homeCity,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        userId: account.id,
        days: {
          create: startDate
            ? [
                {
                  date: new Date(startDate),
                  city: homeCity || "Paris",
                },
              ]
            : [],
        },
      },
      include: { days: true },
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("Error creating trip", error);
    return NextResponse.json({ error: "Failed to create trip." }, { status: 500 });
  }
}
