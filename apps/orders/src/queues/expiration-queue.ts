// import Bull = require("bull");
import { Queue, Worker } from "bullmq";
import { pl } from "../logger";

import { OrderExpiredEvent, Subjects } from "@booking/common";
// import { orderExpiredPublisher } from "../events/order-expired-publisher";
import { db } from "../db";
import { ordersTable, OrderStatus } from "../db/schema";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { stripe } from "../utils/stripe";
import { addEventToOutBox } from "../outbox";

export const EXPIRATION_BULL_QUEUE_NAME = "order-expiration";

export const bullQueue = new Queue<OrderExpiredEvent["data"]>(
  EXPIRATION_BULL_QUEUE_NAME,
  {
    connection: {
      host: process.env.REDIS_HOST,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  },
);

bullQueue.on("error", (err) => {
  pl.error(err, "Error in expiration queue");
});

export const expirationWorker = new Worker(
  EXPIRATION_BULL_QUEUE_NAME,
  async (job) => {
    pl.info(
      {
        jobId: job.id,
        orderId: job.data?.orderId,
        ticketIds: job.data?.ticketIds,
        queueName: job.queueName,
      },
      "Processing expiration job",
    );

    const errorMessages: Partial<Record<OrderStatus, string>> = {
      [OrderStatus.EXPIRED]: "Order already expired",
      [OrderStatus.SUCCEEDED]: "Order already succeeded",
      [OrderStatus.CANCELED]: "Order already canceled",
    };

    try {
      await db.transaction(async (tx) => {
        const orderArr = await tx
          .select()
          .from(ordersTable)
          .where(
            // and(
            eq(ordersTable.id, job.data.orderId),
            // notInArray(ordersTable.status, [
            //   OrderStatus.EXPIRED,
            //   OrderStatus.SUCCEEDED,
            // ]),
            // ),
          )
          .limit(1)
          .for("update");

        if (!orderArr[0]) {
          pl.warn(
            { orderId: job.data.orderId },
            "Order not found for expiration job, skipping",
          );
          return;
        }

        const [order] = orderArr;

        // Orders that are already expired, succeeded, or canceled should not be processed for expiration again
        if (errorMessages[order.status]) {
          pl.info(
            { orderId: job.data.orderId, status: order.status },
            errorMessages[order.status],
          );
          return;
        }

        if (!order.paymentIntent) {
          await tx
            .update(ordersTable)
            .set({ status: OrderStatus.EXPIRED })
            .where(eq(ordersTable.id, job.data.orderId));

          await addEventToOutBox(tx, {
            subject: Subjects.OrderExpired,
            data: job.data,
          });
        } else {
          // cancel payment intent with Stripe
          const paymentIntentId = order.paymentIntent.id;

          await stripe.paymentIntents.cancel(paymentIntentId).catch((err) => {
            pl.error(
              { err, paymentIntentId, orderId: job.data.orderId },
              "Failed to cancel payment intent in Stripe",
            );

            // TODO: handle this error better

            throw err;
          });

          // update order status to expired

          await tx
            .update(ordersTable)
            .set({ status: OrderStatus.EXPIRED })
            .where(eq(ordersTable.id, job.data.orderId));

          // TODO: add retry logic for transient errors

          // add event to outbox for eventual consistency with tickets service
          await addEventToOutBox(tx, {
            subject: Subjects.OrderExpired,
            data: job.data,
          });
        }
      });
    } catch (error) {
      pl.error(error, "Error processing expiration job");
      throw error;
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST,
    },
  },
);

// NOTE: https://docs.stripe.com/api/payment_intents/cancel?lang=node
