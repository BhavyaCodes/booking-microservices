CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"seat_category_id" uuid NOT NULL,
	"user_id" uuid
);
