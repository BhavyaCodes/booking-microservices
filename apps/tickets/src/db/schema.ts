import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const eventsTable = pgTable("events", {
  id: uuid().primaryKey().defaultRandom(),
  title: varchar({ length: 255 }).notNull(),
  desc: varchar({ length: 1000 }).notNull(),
  date: timestamp().notNull(),
  draft: boolean().notNull().default(true),
  imageUrl: varchar({ length: 500 }),
});

export const seatCategoriesTable = pgTable("seat_categories", {
  id: uuid().primaryKey().defaultRandom(),
  eventId: uuid()
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  startRow: integer().notNull(),
  endRow: integer().notNull(),
  price: integer().notNull(),
  seatsPerRow: integer().notNull(),
});

export const ticketsTable = pgTable("tickets", {
  id: uuid().primaryKey().defaultRandom(),
  seatCategoryId: uuid()
    .notNull()
    .references(() => seatCategoriesTable.id, { onDelete: "cascade" }),
  row: integer().notNull(),
  seatNumber: integer().notNull(),
});
