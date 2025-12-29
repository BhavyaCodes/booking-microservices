CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" varchar(255) NOT NULL,
	"desc" varchar(1000) NOT NULL,
	"date" timestamp NOT NULL,
	"draft" boolean DEFAULT true NOT NULL,
	"image_url" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject" varchar(255) NOT NULL,
	"data" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"start_row" integer NOT NULL,
	"end_row" integer NOT NULL,
	"price" integer NOT NULL,
	"seats_per_row" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"seat_category_id" uuid NOT NULL,
	"row" integer NOT NULL,
	"seat_number" integer NOT NULL,
	CONSTRAINT "tickets_seat_unique" UNIQUE("seat_category_id","row","seat_number")
);
--> statement-breakpoint
ALTER TABLE "seat_categories" ADD CONSTRAINT "seat_categories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seat_category_id_seat_categories_id_fk" FOREIGN KEY ("seat_category_id") REFERENCES "public"."seat_categories"("id") ON DELETE cascade ON UPDATE no action;