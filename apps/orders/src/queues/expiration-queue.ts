import Bull = require("bull");
import { pl } from "../logger";

import { OrderExpiredEvent, Subjects } from "@booking/common";
// import { orderExpiredPublisher } from "../events/order-expired-publisher";
import { db } from "../db";
import { ordersTable, OrderStatus } from "../db/schema";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { stripe } from "../utils/stripe";
import { addEventToOutBox } from "../outbox";

const BULL_QUEUE_NAME = "order:expiration";

const expirationQueue = new Bull<OrderExpiredEvent["data"]>(BULL_QUEUE_NAME, {
  redis: {
    host: process.env.REDIS_HOST,
  },
});

expirationQueue.on("error", (err) => {
  pl.error(err, "Error in expiration queue");
});

expirationQueue.whenCurrentJobsFinished().then(() => {
  pl.info("All current jobs in expiration queue have finished");
});

expirationQueue.process(async (job) => {
  pl.info(
    {
      jobId: job.id,
      orderId: job.data?.orderId,
      ticketIds: job.data?.ticketIds,
      queueName: job.queue.name,
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

      if (errorMessages[order.status]) {
        pl.warn(
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
});

export { expirationQueue };

// NOTE: https://docs.stripe.com/api/payment_intents/cancel?lang=node
