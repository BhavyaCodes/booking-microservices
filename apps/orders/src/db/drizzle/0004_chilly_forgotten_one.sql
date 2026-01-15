CREATE TYPE "public"."order_status" AS ENUM('created', 'canceled', 'completed', 'expired');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::text::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'created';--> statement-breakpoint
DROP TYPE "public"."nats_subjects";