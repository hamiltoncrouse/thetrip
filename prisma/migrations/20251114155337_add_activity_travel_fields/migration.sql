-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "travelDistanceMeters" INTEGER,
ADD COLUMN     "travelDurationSeconds" INTEGER,
ADD COLUMN     "travelPolyline" TEXT,
ADD COLUMN     "travelSummary" TEXT;

