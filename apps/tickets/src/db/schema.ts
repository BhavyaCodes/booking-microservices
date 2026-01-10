import {
  pgTable,
  varchar,
  timestamp,
  boolean,
  integer,
  unique,
  uuid,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { NATSEvent, Subjects } from "@booking/common";

export const eventsTable = pgTable("events", {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  title: varchar({ length: 255 }).notNull(),
  desc: varchar({ length: 1000 }).notNull(),
  date: timestamp().notNull(),
  draft: boolean().notNull().default(true),
  imageUrl: varchar({ length: 500 }),
});

export const seatCategoriesTable = pgTable("seat_categories", {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  eventId: uuid()
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  startRow: integer().notNull(),
  endRow: integer().notNull(),
  price: integer().notNull(),
  seatsPerRow: integer().notNull(),
});

export const ticketsTable = pgTable(
  "tickets",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    seatCategoryId: uuid()
      .notNull()
      .references(() => seatCategoriesTable.id, { onDelete: "cascade" }),
    row: integer().notNull(),
    seatNumber: integer().notNull(),
    userId: uuid(),
  },
  (table) => [
    unique("tickets_seat_unique").on(
      table.seatCategoryId,
      table.row,
      table.seatNumber,
    ),
  ],
);

export const subjectEnum = pgEnum(
  "nats_subjects",
  Object.values(Subjects) as [string, ...string[]],
);

export const outboxTable = pgTable("outbox", {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  subject: subjectEnum().notNull().$type<NATSEvent["subject"]>(),
  data: jsonb().notNull().$type<NATSEvent["data"]>(),
  processed: boolean().notNull().default(false),
});
