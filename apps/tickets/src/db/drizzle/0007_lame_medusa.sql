ALTER TYPE "public"."nats_subjects" ADD VALUE 'orders.expired';--> statement-breakpoint
ALTER TYPE "public"."nats_subjects" ADD VALUE 'orders.confirmed';--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sold" boolean DEFAULT false NOT NULL;