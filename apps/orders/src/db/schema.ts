import {
  pgTable,
  integer,
  uuid,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
  varchar,
} from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import { Stripe } from "stripe";

export enum OrderStatus {
  /**
   * Order has been created but not yet completed
   * user can only have one created order at a time
   */
  CREATED = "created",
  /**
   * payment intent has been created for the order
   */
  PAYMENT_IN_PROGRESS = "payment_in_progress",
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
    userId: varchar({ length: 255 }).notNull(),
    amount: integer().notNull(),
    status: orderStatusEnum()
      .notNull()
      .default(OrderStatus.CREATED)
      .$type<OrderStatus>(),
    expiresAt: timestamp().notNull(),
    ticketIds: uuid().array().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    paymentIntent: jsonb()
      .default(null)
      .$type<Stripe.Response<Stripe.PaymentIntent>>(),
  },
  (table) => [
    index("ticket_ids_idx").using("gin", table.ticketIds),
    uniqueIndex("user_created_order_idx")
      .on(table.userId, table.status)
      .where(eq(table.status, OrderStatus.CREATED)),
  ],
);

// 1 user can only add 1 created order at a time
