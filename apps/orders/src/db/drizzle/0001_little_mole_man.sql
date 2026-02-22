CREATE TYPE "public"."nats_subjects" AS ENUM('tickets.created', 'tickets.updated', 'tickets.reserved', 'orders.expired');--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject" "nats_subjects" NOT NULL,
	"data" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL
);
