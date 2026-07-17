-- Super-admin management fields: approval gates + verified badge.
ALTER TABLE "users" ADD COLUMN "provider_approved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "is_verified"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "rider_approved"    BOOLEAN NOT NULL DEFAULT true;
