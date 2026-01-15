CREATE TYPE "public"."nats_subjects" AS ENUM('created', 'canceled', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" "nats_subjects" DEFAULT 'created' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ticket_ids" text[] NOT NULL
);
--> statement-breakpoint
DROP TABLE "tickets" CASCADE;