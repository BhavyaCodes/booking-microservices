ALTER TYPE "public"."order_status" ADD VALUE 'payment_in_progress' BEFORE 'canceled';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_intent" jsonb DEFAULT 'null'::jsonb;