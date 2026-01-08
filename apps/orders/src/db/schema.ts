import {
  pgTable,
  boolean,
  integer,
  unique,
  uuid,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { NATSEvent, Subjects } from "@booking/common";

export const ticketsTable = pgTable(
  "tickets",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    seatCategoryId: uuid().notNull(),
    userId: uuid(),
  },
  // (table) => [
  //   unique("tickets_seat_unique").on(
  //     table.seatCategoryId,
  //     table.row,
  //     table.seatNumber,
  //   ),
  // ],
);

// export const subjectEnum = pgEnum(
//   "nats_subjects",
//   Object.values(Subjects) as [string, ...string[]],
// );

// export const outboxTable = pgTable("outbox", {
//   id: uuid()
//     .primaryKey()
//     .default(sql`uuidv7()`),
//   subject: subjectEnum().notNull().$type<NATSEvent["subject"]>(),
//   data: jsonb().notNull().$type<NATSEvent["data"]>(),
//   processed: boolean().notNull().default(false),
// });
