-- Add profile fields: short custom status message + "about me" bio.
ALTER TABLE "User" ADD COLUMN "customStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
