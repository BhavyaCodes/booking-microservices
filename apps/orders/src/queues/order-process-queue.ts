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
import Stripe from "stripe";

export const PROCESS_ORDER_QUEUE = "order-process";

type JobData = {
  ticketIds: string[];
};

const redisHost = process.env.REDIS_HOST;
if (!redisHost) {
  throw new Error("REDIS_HOST must be present");
}

export const bullQueue = new Queue<JobData>(PROCESS_ORDER_QUEUE, {
  connection: {
    host: redisHost,
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
    // If we decide to retry, we must throw *after* the DB transaction commits.
    // Otherwise any DB updates done inside the transaction would be rolled back.
    let delayedError: DelayedError | null = null;

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

        pl.debug(
          { orderId: orderId, orderArr },
          "Fetched order for expiration processing",
        );

        const [order] = orderArr;

        if (order.ordersQueueProcessed) {
          pl.info(
            { orderId: orderId, status: order.status },
            "Order already expired, skipping expiration processing",
          );
          return;
        }

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
          if (order.status === OrderStatus.SUCCEEDED) {
            pl.debug(
              "send order succeeded event to outbox for orderId:" + order.id,
            );
            await tx
              .update(ordersTable)
              .set({ ordersQueueProcessed: true })
              .where(eq(ordersTable.id, orderId));

            await addEventToOutBox(tx, {
              subject: Subjects.OrderConfirmed,
              data: {
                orderId,
                ticketIds: job.data.ticketIds,
              },
            });

            pl.debug(
              "Order already succeeded, marked as processed and sent OrderConfirmed event to outbox for orderId: " +
                order.id,
            );
            return;
          }

          if (order.status === OrderStatus.CANCELED) {
            pl.info(
              { orderId: orderId },
              "Payment intent already canceled, marking order as expired",
            );
            await tx
              .update(ordersTable)
              .set({ ordersQueueProcessed: true })
              .where(eq(ordersTable.id, orderId));

            pl.debug(
              "Order already canceled, marked as processed for orderId: " +
                order.id,
            );

            await addEventToOutBox(tx, {
              subject: Subjects.OrderExpired,
              data: {
                orderId,
                ticketIds: job.data.ticketIds,
              },
            });
            return;
          }

          // cancel payment intent with Stripe
          const paymentIntentId = order.paymentIntent.id;

          try {
            await stripe.paymentIntents.cancel(paymentIntentId);

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
          } catch (error: any) {
            if (error instanceof Stripe.errors.StripeInvalidRequestError) {
              switch (error.code) {
                case "payment_intent_unexpected_state":
                  pl.warn(
                    { error, paymentIntentId, orderId: orderId },
                    "Payment intent in unexpected state in Stripe, likely already canceled or succeeded",
                  );

                  // fetch the payment intent to check its current status
                  const paymentIntent =
                    await stripe.paymentIntents.retrieve(paymentIntentId);

                  pl.debug(
                    {
                      fetchedPaymentIntentStatus: paymentIntent.status,
                    },
                    "Fetched payment intent status from Stripe after unexpected state error",
                  );

                  if (
                    paymentIntent.status === OrderStatus.SUCCEEDED ||
                    paymentIntent.status === OrderStatus.CANCELED
                  ) {
                    pl.info(
                      {
                        paymentIntentId,
                        paymentIntentStatus: paymentIntent.status,
                        orderId: orderId,
                      },
                      "Payment intent already in terminal state in Stripe, marking order as processed",
                    );

                    await tx
                      .update(ordersTable)
                      .set({
                        ordersQueueProcessed: true,
                        status:
                          paymentIntent.status === OrderStatus.SUCCEEDED
                            ? OrderStatus.SUCCEEDED
                            : OrderStatus.EXPIRED,
                        paymentIntent,
                      })
                      .where(eq(ordersTable.id, orderId));

                    if (paymentIntent.status === OrderStatus.SUCCEEDED) {
                      await addEventToOutBox(tx, {
                        subject: Subjects.OrderConfirmed,
                        data: {
                          orderId,
                          ticketIds: job.data.ticketIds,
                        },
                      });
                    } else if (paymentIntent.status === OrderStatus.CANCELED) {
                      await addEventToOutBox(tx, {
                        subject: Subjects.OrderExpired,
                        data: {
                          orderId,
                          ticketIds: job.data.ticketIds,
                        },
                      });
                    }
                  } else if (
                    Object.values(OrderStatus).includes(
                      paymentIntent.status as OrderStatus,
                    )
                  ) {
                    await tx
                      .update(ordersTable)
                      .set({ status: paymentIntent.status as OrderStatus })
                      .where(eq(ordersTable.id, orderId));
                    pl.error(
                      {
                        paymentIntentId,
                        paymentIntentStatus: paymentIntent.status,
                        orderId: orderId,
                      },
                      "Payment intent in non-terminal state in Stripe, updating order status accordingly",
                    );

                    delayedError = new DelayedError(
                      "Payment intent in non-terminal state in Stripe, retrying",
                    );
                    return;
                  } else {
                    pl.error(
                      {
                        paymentIntentId,
                        paymentIntentStatus: paymentIntent.status,
                        orderId: orderId,
                      },
                      "Payment intent in unknown state in Stripe, cannot determine how to update order",
                    );
                    delayedError = new DelayedError(
                      "Payment intent in unknown state in Stripe, retrying",
                    );
                    return;
                  }
                  break;

                default:
                  pl.error(
                    { error, paymentIntentId, orderId: orderId },
                    "StripeInvalidRequestError while canceling payment intent in Stripe",
                  );
                  // throw error;
                  throw new DelayedError(
                    "StripeInvalidRequestError while canceling payment intent in Stripe, retrying",
                  );
              }
            } else {
              pl.error(
                { error, paymentIntentId, orderId: orderId },
                "Failed to cancel payment intent in Stripe",
              );
              throw new DelayedError(
                "Failed to cancel payment intent in Stripe, retrying",
              );
            }
          }
        }
      });

      if (delayedError) {
        throw delayedError;
      }
    } catch (error) {
      pl.error(error, "Error processing expiration job");
      throw error;
    }
  },
  {
    connection: {
      host: redisHost,
    },
  },
);

// NOTE: https://docs.stripe.com/api/payment_intents/cancel?lang=node
