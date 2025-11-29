-- Add savedProfiles to User for reusable trip profiles
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "savedProfiles" JSONB;

-- Add profile linkage to Trip
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "profile" JSONB;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
