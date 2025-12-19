import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const eventsTable = pgTable("events", {
  id: uuid().primaryKey().defaultRandom(),
  title: varchar({ length: 255 }).notNull(),
  desc: varchar({ length: 1000 }).notNull(),
  date: timestamp().notNull(),
  draft: boolean().notNull().default(true),
  imageUrl: varchar({ length: 500 }),
});
