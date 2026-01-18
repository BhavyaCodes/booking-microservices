CREATE TYPE "public"."order_status" AS ENUM('created', 'canceled', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ticket_ids" uuid[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ticket_ids_idx" ON "orders" USING gin ("ticket_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "user_created_order_idx" ON "orders" USING btree ("user_id","status") WHERE "orders"."status" = 'created';