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
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { Stripe } from "stripe";
import { NATSEvent, Subjects } from "@booking/common";

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
  REQUIRES_CAPTURE = "requires_capture",
  REQUIRES_CONFIRMATION = "requires_confirmation",
  REQUIRES_PAYMENT_METHOD = "requires_payment_method",
  PROCESSING = "processing",

  CANCELED = "canceled",

  SUCCEEDED = "succeeded",
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
    expiryQueueProcessed: boolean().notNull().default(false),
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
