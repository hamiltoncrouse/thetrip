import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const createTripSchema = z.object({
  title: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  homeCity: z.string().optional(),
  description: z.string().optional(),
  userId: z.string().optional(),
});

const DEFAULT_USER_ID = "demo-user";

export async function GET() {
  const trips = await prisma.trip.findMany({
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

  return NextResponse.json({ trips });
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = createTripSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { title, description, startDate, endDate, homeCity, userId } = parsed.data;

  const trip = await prisma.trip.create({
    data: {
      title,
      description,
      homeCity,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      userId: userId ?? DEFAULT_USER_ID,
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
}
