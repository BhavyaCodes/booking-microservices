ALTER TABLE "orders" ALTER COLUMN "ticket_ids" SET DATA TYPE uuid[] USING ticket_ids::uuid[];--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;