import {
  pgTable,
  integer,
  uuid,
  timestamp,
  text,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export enum OrderStatus {
  CREATED = "created",
  CANCELED = "canceled",
  COMPLETED = "completed",
  EXPIRED = "expired",
}

export const orderStatusEnum = pgEnum(
  "order_status",
  Object.values(OrderStatus) as [string, ...string[]],
);

export const ordersTable = pgTable(
  "orders",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid().notNull(),
    amount: integer().notNull(),
    status: orderStatusEnum()
      .notNull()
      .default(OrderStatus.CREATED)
      .$type<OrderStatus>(),
    expiresAt: timestamp().notNull(),
    ticketIds: uuid("ticket_ids").array().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("ticket_ids_idx").using("gin", table.ticketIds)],
);
