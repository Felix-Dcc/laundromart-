-- Provider toggle: pause/resume accepting new orders (defaults to accepting).
ALTER TABLE "users" ADD COLUMN "accepting_orders" BOOLEAN NOT NULL DEFAULT true;
