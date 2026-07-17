-- Add the superadmin role. Kept in its own migration so the new enum value
-- is committed before any later migration/code references it.
ALTER TYPE "UserType" ADD VALUE IF NOT EXISTS 'superadmin';
