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
import { sql } from "drizzle-orm";
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
  PAYMENT_INTENT_CREATED = "payment_intent_created",
  REQUIRES_ACTION = "requires_action",
  PROCESSING = "processing",
  CANCELED = "canceled",
  COMPLETED = "completed",
  /**
   * Order has expired without payment
   */
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
    uniqueIndex("user_active_order_idx")
      .on(table.userId)
      .where(
        sql.raw(
          `"orders"."status" IN ('${OrderStatus.CREATED}', '${OrderStatus.PAYMENT_INTENT_CREATED}', '${OrderStatus.REQUIRES_ACTION}', '${OrderStatus.PROCESSING}')`,
        ),
      ),
  ],
);

// 1 user can only have 1 active order at a time
