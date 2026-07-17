-- Phase 4: support ticketing, admin 2FA, promo redemption on orders.
CREATE TYPE "TicketStatus" AS ENUM ('open', 'pending', 'resolved', 'closed');

CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets"("user_id");
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticket_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticket_messages_ticket_id_idx" ON "ticket_messages"("ticket_id");
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Admin TOTP 2FA
ALTER TABLE "users" ADD COLUMN "twofa_secret" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN "twofa_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Promo redemption on orders
ALTER TABLE "laundry_requests" ADD COLUMN "promo_code" VARCHAR(40);
ALTER TABLE "laundry_requests" ADD COLUMN "promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0.00;
