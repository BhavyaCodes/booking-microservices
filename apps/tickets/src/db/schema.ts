import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const eventsTable = pgTable("events", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull().unique(),
  date: timestamp().notNull(),
  draft: boolean().notNull().default(true),
  imageUrl: varchar({ length: 500 }),
});
