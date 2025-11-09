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

function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { account } = await authenticateRequest(request);
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
    const { account } = await authenticateRequest(req);
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
