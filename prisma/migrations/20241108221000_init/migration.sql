-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('manual', 'ai', 'hotel', 'import');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('car', 'train', 'flight', 'boat', 'transit', 'walk');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "homeCity" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "homeCity" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "source" "ActivitySource" NOT NULL DEFAULT 'manual',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelSegment" (
    "id" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "mode" "TravelMode" NOT NULL DEFAULT 'car',
    "distanceKm" DOUBLE PRECISION,
    "durationMinutes" INTEGER,
    "warnings" JSONB,
    "cachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerId" TEXT,
    "pricePerNight" DECIMAL(10,2),
    "currency" TEXT DEFAULT 'USD',
    "rating" DOUBLE PRECISION,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "city" TEXT,
    "day" TIMESTAMP(3),
    "hash" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

-- CreateIndex
CREATE INDEX "TripDay_tripId_date_idx" ON "TripDay"("tripId", "date");

-- CreateIndex
CREATE INDEX "Activity_tripDayId_startTime_idx" ON "Activity"("tripDayId", "startTime");

-- CreateIndex
CREATE INDEX "TravelSegment_tripDayId_idx" ON "TravelSegment"("tripDayId");

-- CreateIndex
CREATE INDEX "Hotel_tripDayId_idx" ON "Hotel"("tripDayId");

-- CreateIndex
CREATE UNIQUE INDEX "AISuggestion_hash_key" ON "AISuggestion"("hash");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelSegment" ADD CONSTRAINT "TravelSegment_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestion" ADD CONSTRAINT "AISuggestion_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

