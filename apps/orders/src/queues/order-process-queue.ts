// import Bull = require("bull");
import { DelayedError, Queue, Worker } from "bullmq";
import { pl } from "../logger";

import { Subjects } from "@booking/common";
// import { orderExpiredPublisher } from "../events/order-expired-publisher";
import { db } from "../db";
import { ordersTable, OrderStatus } from "../db/schema";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { stripe } from "../utils/stripe";
import { addEventToOutBox } from "../outbox";

export const PROCESS_ORDER_QUEUE = "order-process";

type JobData = {
  ticketIds: string[];
};

export const bullQueue = new Queue<JobData>(PROCESS_ORDER_QUEUE, {
  connection: {
    host: process.env.REDIS_HOST,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      age: 60 * 60 * 24, // 1 day
    },
    removeOnFail: {
      age: 60 * 60 * 24 * 7, // 1 week
    },
  },
});

bullQueue.on("error", (err) => {
  pl.error(err, "Error in expiration queue");
});

export const expirationWorker = new Worker<JobData>(
  PROCESS_ORDER_QUEUE,
  async (job) => {
    pl.info(
      {
        jobId: job.id, // also orderId
        ticketIds: job.data.ticketIds,
        queueName: job.queueName,
      },
      "Processing expiration job",
    );

    // To make typescript happy about job.id, we need to check if it's undefined,
    // even though in our usage it should always be defined as we set
    // it to orderId when adding the job to the queue
    if (!job.id) {
      pl.error(
        { jobId: job.id, ticketIds: job.data.ticketIds },
        "Job ID is missing, cannot process expiration job",
      );
      throw new Error("Job ID is missing");
    }

    const orderId = job.id;

    try {
      await db.transaction(async (tx) => {
        const orderArr = await tx
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId))
          .for("update");

        if (!orderArr[0]) {
          pl.warn(
            { orderId: orderId },
            "Order not found for expiration job, skipping",
          );
          return;
        }

        const [order] = orderArr;

        if (order.ordersQueueProcessed) {
          pl.info(
            { orderId: orderId, status: order.status },
            "Order already expired, skipping expiration processing",
          );
          return;
        }

        if (order.status === OrderStatus.SUCCEEDED) {
          pl.debug(
            "send order succeeded event to outbox for orderId:" + order.id,
          );
          await tx
            .update(ordersTable)
            .set({ ordersQueueProcessed: true })
            .where(eq(ordersTable.id, orderId));

          // TODO: send order succeeded event to outbox for eventual consistency with tickets service
          pl.debug(
            "============ Adding OrderSucceeded event to outbox for orderId:" +
              order.id,
          );
          return;
        }

        // Orders that are already expired, succeeded, or canceled should not be processed for expiration again

        if (!order.paymentIntent) {
          await tx
            .update(ordersTable)
            .set({
              status: OrderStatus.EXPIRED,
              ordersQueueProcessed: true,
            })
            .where(eq(ordersTable.id, orderId));

          await addEventToOutBox(tx, {
            subject: Subjects.OrderExpired,
            data: {
              orderId,
              ticketIds: job.data.ticketIds,
            },
          });
        } else {
          // cancel payment intent with Stripe
          const paymentIntentId = order.paymentIntent.id;

          await stripe.paymentIntents.cancel(paymentIntentId).catch((err) => {
            pl.error(
              { err, paymentIntentId, orderId: orderId },
              "Failed to cancel payment intent in Stripe",
            );

            const noOfAttempts = job.attemptsMade + 1; // attemptsMade is zero-indexed

            // set custom backoff delay for retry based on number of attempts
            const delayInMs = 1000 * 10 ** noOfAttempts;

            job.moveToDelayed(Date.now() + delayInMs);
            // TODO: handle this error better

            throw new DelayedError(
              `Failed to cancel payment intent in Stripe, retrying in ${delayInMs / 1000} seconds`,
            );
          });

          // update order status to expired

          await tx
            .update(ordersTable)
            .set({ status: OrderStatus.EXPIRED, ordersQueueProcessed: true })
            .where(eq(ordersTable.id, orderId));

          // add event to outbox for eventual consistency with tickets service
          await addEventToOutBox(tx, {
            subject: Subjects.OrderExpired,
            data: {
              orderId,
              ticketIds: job.data.ticketIds,
            },
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
