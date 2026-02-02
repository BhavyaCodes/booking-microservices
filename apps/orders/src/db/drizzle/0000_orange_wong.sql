CREATE TYPE "public"."order_status" AS ENUM('created', 'payment_intent_created', 'requires_action', 'processing', 'canceled', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"amount" integer NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ticket_ids" uuid[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"payment_intent" jsonb DEFAULT 'null'::jsonb
);
--> statement-breakpoint
CREATE INDEX "ticket_ids_idx" ON "orders" USING gin ("ticket_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "user_active_order_idx" ON "orders" USING btree ("user_id") WHERE "orders"."status" IN ('created', 'payment_intent_created', 'requires_action', 'processing');