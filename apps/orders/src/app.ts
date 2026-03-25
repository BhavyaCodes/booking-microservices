import type { CurrentUser } from "@booking/common/interfaces";
import {
  extractCurrentUser,
  requireAdmin,
  requireAuth,
} from "@booking/common/middlewares";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { db } from "./db";
import { ordersTable, OrderStatus } from "./db/schema";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
  zodValidationHook,
} from "@booking/common";
import { pl } from "./logger";
import Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { countryCodes } from "./utils/country-iso-3166-1-alpha-2";
import { stripe, upsertStripeCustomer } from "./utils/stripe";
import { bullQueue } from "./queues/order-process-queue";
import { ErrorCode } from "bullmq";

const app = new Hono<{
  Variables: {
    currentUser: CurrentUser;
  };
}>()
  // @ts-expect-error TODO fix this
  .use(process.env.NODE_ENV === "test" ? "*" : logger())
  .use(extractCurrentUser)
  .get("/api/orders", (c) => {
    return c.text("Hello from orders service!");
  })
  .get("/api/orders/admin/orders", requireAdmin, async (c) => {
    const allOrders = await db.select().from(ordersTable);
    return c.json({ orders: allOrders });
  })
  .post(
    "/api/orders/create-payment-intent/:orderId",
    requireAuth,
    zValidator(
      "param",
      z.object({ orderId: z.uuid({ version: "v7" }) }),
      zodValidationHook,
    ),
    zValidator(
      "json",
      z.object({
        address: z.object({
          city: z.string().max(50),
          country: z
            .string()
            .length(2)
            .refine((val) => {
              if (val in countryCodes) {
                return true;
              }
              return false;
            }),
          line1: z.string(),
          line2: z.string().optional(),
          postal_code: z.string().max(20),
          state: z.string(),
        }),
        name: z.string().max(100),
      }),
      zodValidationHook,
    ),
    async (c) => {
      const { orderId } = c.req.param();
      const { address, name } = c.req.valid("json");
      const userId = c.get("currentUser")!.id;

      // Upsert Stripe customer before transaction
      const stripeCustomerId = await upsertStripeCustomer(
        userId,
        address,
        name,
        stripe,
      );

      try {
        const result = await db.transaction(async (tx) => {
          const result = await tx
            .select()
            .from(ordersTable)
            .where(
              and(
                eq(ordersTable.id, orderId),
                eq(ordersTable.userId, userId),
                eq(ordersTable.status, OrderStatus.CREATED),
              ),
            )
            .for("update");

          if (result.length === 0) {
            throw new HTTPException(404, {
              res: new CustomErrorResponse({
                message: "Order not found",
              }),
            });
          }

          const order = result[0];

          if (order.paymentIntent) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                message: "Payment intent already exists for this order",
              }),
            });
          }

          const paymentIntent = await stripe.paymentIntents.create({
            amount: order.amount,
            currency: "inr",
            customer: stripeCustomerId,
            metadata: {
              orderId: order.id,
            },
            description: `Payment for order ${order.id}`,
          });

          pl.debug(paymentIntent, "Created Payment Intent");

          const updated = await tx
            .update(ordersTable)
            .set({ paymentIntent, status: OrderStatus.PAYMENT_INTENT_CREATED })
            .where(eq(ordersTable.id, order.id))
            .returning();

          pl.debug(updated, "Updated Order with Payment Intent");

          return updated[0];
        });
        return c.json({ order: result });
      } catch (error) {
        pl.error(error, "Error creating payment intent");
        throw error;
      }
    },
  )
  // TODO: add zod validation to this route
  .get("/api/orders/pending", requireAuth, async (c) => {
    const currentUser = c.get("currentUser");

    const pendingOrder = await db.query.ordersTable.findFirst({
      where(fields, { eq, and }) {
        return and(
          eq(fields.userId, currentUser!.id),
          inArray(fields.status, [
            OrderStatus.CREATED,
            OrderStatus.PAYMENT_INTENT_CREATED,
            OrderStatus.REQUIRES_PAYMENT_METHOD,
          ]),
        );
      },
    });

    pl.debug(pendingOrder, "Fetched pending order");

    return c.json({
      order: pendingOrder || null,
    });
  })
  .get(
    "/api/orders/:orderId/status",
    requireAuth,
    zValidator(
      "param",
      z.object({ orderId: z.uuid({ version: "v7" }) }),
      zodValidationHook,
    ),
    async (c) => {
      const { orderId } = c.req.param();
      const userId = c.get("currentUser")!.id;

      const checkOrderStatus: Record<OrderStatus, boolean> =
        // &  Record<Stripe.PaymentIntent.Status, boolean>
        {
          [OrderStatus.PAYMENT_INTENT_CREATED]: true,
          [OrderStatus.REQUIRES_ACTION]: true,
          [OrderStatus.PROCESSING]: true,
          [OrderStatus.REQUIRES_CAPTURE]: true,
          [OrderStatus.REQUIRES_CONFIRMATION]: true,
          [OrderStatus.REQUIRES_PAYMENT_METHOD]: true,

          // For created orders, we can consider them as pending and require user action to complete the order
          [OrderStatus.CREATED]: false,

          // For canceled, completed, and expired orders,
          // we can consider them as final states where no further action is required
          [OrderStatus.SUCCEEDED]: false,
          [OrderStatus.CANCELED]: false,
          [OrderStatus.EXPIRED]: false,
        };

      try {
        const updatedOrder = await db.transaction(async (tx) => {
          const ordersArr = await tx
            .select()
            .from(ordersTable)
            .where(
              and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)),
            )
            .for("update");

          if (!ordersArr[0]) {
            throw new HTTPException(404, {
              res: new CustomErrorResponse({
                message: "Order not found",
              }),
            });
          }
          const [order] = ordersArr;

          const orderStatus = order.status;

          if (!checkOrderStatus[orderStatus]) {
            return order;
          }

          // failsafe, this shouldn't happen
          if (!order.paymentIntent) {
            pl.error(
              { orderId },
              "Order is in a pending state but missing payment intent",
            );
            throw new HTTPException(500, {
              res: new CustomErrorResponse({
                message:
                  "Order is in a pending state but missing payment intent",
              }),
            });
          }

          const updatedPaymentIntent = await stripe.paymentIntents.retrieve(
            order.paymentIntent.id,
          );

          pl.debug(
            {
              userId,
              orderId,
              orderStatus,
              updatedPaymentIntent: updatedPaymentIntent.status,
              // updatedPaymentIntentFull: updatedPaymentIntent,
            },
            "Stripe payment intent status during order status check",
          );

          // this is a failsafe, ideally we should never receive an unknown status from Stripe.
          // If we do, it's better to throw an error and investigate rather than silently failing
          // or returning incorrect status to client
          if (!(updatedPaymentIntent.status in checkOrderStatus)) {
            pl.error(
              {
                updatedPaymentIntent,
                updatedPaymentIntentStatus: updatedPaymentIntent.status,
              },
              `Unknown Stripe payment intent status ${updatedPaymentIntent.status} received`,
            );
            throw new HTTPException(500, {
              res: new CustomErrorResponse({
                message: `Unknown payment intent status ${updatedPaymentIntent.status}`,
              }),
            });
          }

          // update order status in database if it has changed
          // if (updatedPaymentIntent.status !== order.paymentIntent.status) {
          const updatedOrders = await tx
            .update(ordersTable)
            .set({
              status: updatedPaymentIntent.status as OrderStatus,
              paymentIntent: updatedPaymentIntent,
            })
            .where(eq(ordersTable.id, orderId))
            .returning();

          if (
            updatedPaymentIntent.status === OrderStatus.SUCCEEDED ||
            updatedPaymentIntent.status === OrderStatus.CANCELED
          ) {
            // we should promote the job in bull queue to expedite the
            // processing of the order, since we already know the final status
            // of the order from Stripe, we can skip waiting for the job
            // to be processed at its scheduled time and expedite it immediately
            const job = await bullQueue.getJob(orderId);

            if (!job) {
              return updatedOrders[0];
            }

            try {
              await job.promote();
            } catch (error) {
              const code =
                error instanceof Error && "code" in error
                  ? Number((error as any).code)
                  : null;

              if (code === ErrorCode.JobNotInState) {
                pl.info(
                  { orderId, job },
                  "Job not in a promotable state, skipping promotion",
                );
              } else {
                throw error;
              }
            }
          }

          return updatedOrders[0];

          // } else {
          //   return order;
          // }
        });
        return c.json({ order: updatedOrder });
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        pl.error(error, "Error checking order status");
        throw new HTTPException(500, {
          res: new CustomErrorResponse({
            message: "Failed to check order status",
          }),
        });
      }
    },
  )
  .post(
    "/api/orders/:orderId/cancel",
    requireAuth,
    zValidator(
      "param",
      z.object({ orderId: z.uuid({ version: "v7" }) }),
      zodValidationHook,
    ),
    async (c) => {
      const { orderId } = c.req.param();

      const userId = c.get("currentUser")!.id;

      try {
        const result = await db.transaction(async (tx) => {
          const ordersArr = await tx
            .select()
            .from(ordersTable)
            .where(
              and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)),
            )
            .for("update");

          if (!ordersArr[0]) {
            throw new HTTPException(404, {
              res: new CustomErrorResponse({
                message: "Order not found",
              }),
            });
          }

          const [order] = ordersArr;

          if (order.status === OrderStatus.CANCELED) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                code: ErrorCodes.PAYMENT_CANCEL_ALREADY_CANCELED,
                message: "Order is already canceled",
              }),
            });
          }

          if (order.status === OrderStatus.SUCCEEDED) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                code: ErrorCodes.PAYMENT_CANCEL_ALREADY_SUCCEEDED,
                message: "Order is already succeeded, cannot cancel",
              }),
            });
          }

          if (order.status === OrderStatus.EXPIRED) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                code: ErrorCodes.PAYMENT_CANCEL_ALREADY_EXPIRED,
                message: `Order is already expired, cannot cancel`,
              }),
            });
          }

          const job = await bullQueue.getJob(orderId);

          if (!order.paymentIntent) {
            const [updatedOrder] = await tx
              .update(ordersTable)
              .set({ status: OrderStatus.CANCELED })
              .where(eq(ordersTable.id, orderId))
              .returning();

            if (job) {
              try {
                await job.promote();
              } catch (error) {
                const code =
                  error instanceof Error && "code" in error
                    ? Number((error as any).code)
                    : null;

                if (code === ErrorCode.JobNotInState) {
                  pl.info(
                    { orderId, job },
                    "Job not in a promotable state, skipping promotion",
                  );
                } else {
                  throw error;
                }
              }
            }

            return updatedOrder;
          } else {
            // cancel payment intent in Stripe

            try {
              await stripe.paymentIntents.cancel(order.paymentIntent.id);
            } catch (error) {
              pl.error(error, "Error canceling payment intent in Stripe");
              throw new HTTPException(500, {
                res: new CustomErrorResponse({
                  code: ErrorCodes.PAYMENT_CANCELLATION_FAILED,
                  message: "Failed to cancel payment intent",
                }),
              });
            }

            const [updatedOrder] = await tx
              .update(ordersTable)
              .set({ status: OrderStatus.CANCELED })
              .where(eq(ordersTable.id, orderId))
              .returning();

            if (job) {
              try {
                await job.promote();
              } catch (error) {
                const code =
                  error instanceof Error && "code" in error
                    ? Number((error as any).code)
                    : null;

                if (code === ErrorCode.JobNotInState) {
                  pl.info(
                    { orderId, job },
                    "Job not in a promotable state, skipping promotion",
                  );
                } else {
                  throw error;
                }
              }
            }

            return updatedOrder;
          }
        });

        return c.json({ order: result });
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        pl.error(error, "Error canceling order");
        throw new HTTPException(500, {
          res: new CustomErrorResponse({
            message: "Failed to cancel order",
          }),
        });
      }
    },
  )
  .post("/api/orders/stripe-webhook", async (c) => {
    const endpointSecret = process.env.ORDERS_STRIPE_WEBHOOK_SECRET!;
    pl.debug("Received Stripe webhook");

    const signature = c.req.header("Stripe-Signature");

    if (!signature) {
      throw new HTTPException(400, {
        res: new CustomErrorResponse({
          message: "Missing Stripe-Signature header",
        }),
      });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        await c.req.text(),
        signature,
        endpointSecret,
      );
    } catch (err) {
      pl.error(err, `⚠️ Webhook signature verification failed.`);

      throw new HTTPException(400, {
        res: new CustomErrorResponse({
          message: "Webhook signature verification failed.",
        }),
      });
    }

    if (!event) {
      throw new HTTPException(500, {
        res: new CustomErrorResponse({
          message: "Failed to construct Stripe event",
        }),
      });
    }

    const orderId = (event.data.object as Stripe.PaymentIntent).metadata
      .orderId;

    if (!orderId) {
      throw new HTTPException(400, {
        res: new CustomErrorResponse({
          message: "Missing orderId in PaymentIntent metadata",
        }),
      });
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        pl.debug(event.data.object, "PaymentIntent succeeded webhook received");

        // Update order status to SUCCEEDED
        // NOTE: job.promote() is inside the transaction intentionally.
        // The worker uses SELECT...FOR UPDATE on the order row, so it will
        // block until this transaction commits — guaranteeing it reads
        // the committed SUCCEEDED status. If promote() fails, the
        // transaction rolls back.
        try {
          await db.transaction(async (tx) => {
            const orderArr = await tx
              .select()
              .from(ordersTable)
              .where(eq(ordersTable.id, orderId))
              .for("update");

            if (!orderArr[0]) {
              pl.warn({ orderId }, "Order not found for succeeded webhook");
              return;
            }

            const [order] = orderArr;

            // Expired state, shouldn't happen orders get cancelled before they get expired by bull queue,
            // this is a failsafe
            // In that case, we should not update the order status to succeeded
            if (
              order.status === OrderStatus.EXPIRED ||
              order.status === OrderStatus.SUCCEEDED
            ) {
              pl.error(
                { orderId, status: order.status },
                "Order already in terminal state, skipping succeeded webhook",
              );
              return;
            }

            await tx
              .update(ordersTable)
              .set({
                status: OrderStatus.SUCCEEDED,
                paymentIntent: event.data.object,
              })
              .where(eq(ordersTable.id, orderId));

            const job = await bullQueue.getJob(orderId);

            pl.debug({ job }, "Fetched expiration job for successful payment");

            if (!job) {
              pl.error(
                { orderId },
                "No pending job found for successful payment, skipping",
              );
              return;
            }

            try {
              await job.promote();
            } catch (error) {
              const code =
                error instanceof Error && "code" in error
                  ? Number((error as any).code)
                  : null;

              if (code === ErrorCode.JobNotInState) {
                pl.info(
                  { orderId, job },
                  "Job not in a promotable state, skipping promotion",
                );
              } else {
                throw error;
              }
            }
          });

          return c.json({ received: true });
        } catch (error) {
          pl.error(error, "Failed to update order status");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update order status",
            }),
          });
        }

      // NOTE: payment_failed means the payment attempt failed,
      // but the payment intent may still be active and can be retried by the user.
      // So we should not mark the order as canceled immediately,
      // instead we should wait for either a successful payment OR
      // an explicit cancellation from the user.
      case "payment_intent.payment_failed":
        pl.debug(
          event.data.object,
          "PaymentIntent payment_failed webhook received",
        );

        try {
          await db.transaction(async (tx) => {
            const orderArr = await tx
              .select()
              .from(ordersTable)
              .where(eq(ordersTable.id, orderId))
              .for("update");

            if (!orderArr[0]) {
              pl.warn(
                { orderId },
                "Order not found for payment_failed webhook",
              );
              return;
            }

            const [order] = orderArr;

            const terminalStatuses: OrderStatus[] = [
              OrderStatus.EXPIRED,
              OrderStatus.CANCELED,
              OrderStatus.SUCCEEDED,
            ];

            if (terminalStatuses.includes(order.status)) {
              pl.info(
                { orderId, status: order.status },
                "Order already in future/terminal state, skipping payment_failed webhook",
              );
              return;
            }

            await tx
              .update(ordersTable)
              .set({
                status: event.data.object.status as OrderStatus,
                paymentIntent: event.data.object,
              })
              .where(eq(ordersTable.id, orderId));
          });

          return c.json({ received: true });
        } catch (error) {
          pl.error(error, "Failed to update order status");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update order status",
            }),
          });
        }

      case "payment_intent.canceled":
        pl.debug(event.data.object, "PaymentIntent canceled webhook received");
        try {
          await db.transaction(async (tx) => {
            const orderArr = await tx
              .select()
              .from(ordersTable)
              .where(eq(ordersTable.id, orderId))
              .for("update");

            if (!orderArr[0]) {
              pl.warn({ orderId }, "Order not found for canceled webhook");
              return;
            }

            const terminalStatuses: OrderStatus[] = [
              OrderStatus.EXPIRED,
              OrderStatus.CANCELED,
              OrderStatus.SUCCEEDED,
            ];

            if (terminalStatuses.includes(orderArr[0].status)) {
              pl.info(
                { orderId, status: orderArr[0].status },
                "Order already in terminal state, skipping canceled webhook",
              );
              return;
            }

            await tx
              .update(ordersTable)
              .set({
                status: OrderStatus.CANCELED,
                paymentIntent: event.data.object,
              })
              .where(eq(ordersTable.id, orderId));

            const job = await bullQueue.getJob(orderId);

            pl.debug({ job }, "Fetched expiration job for canceled payment");

            if (job && job.delay) {
              await job.changeDelay(0);

              pl.debug(
                { orderId },
                "Expediting expiration job for canceled payment",
              );
            } else {
              pl.warn(
                { orderId },
                "No pending expiration job found for canceled payment, skipping",
              );
            }
          });

          return c.json({ received: true });
        } catch (error) {
          pl.error(error, "Failed to update order status");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update order status",
            }),
          });
        }
      case "payment_intent.processing":
        pl.debug(
          event.data.object,
          "PaymentIntent processing webhook received",
        );
        try {
          await db.transaction(async (tx) => {
            const orderArr = await tx
              .select()
              .from(ordersTable)
              .where(eq(ordersTable.id, orderId))
              .for("update");

            if (!orderArr[0]) {
              pl.warn({ orderId }, "Order not found for canceled webhook");
              return;
            }

            const [order] = orderArr;

            const terminalStatuses: OrderStatus[] = [
              OrderStatus.EXPIRED,
              OrderStatus.CANCELED,
              OrderStatus.SUCCEEDED,
            ];

            if (terminalStatuses.includes(order.status)) {
              pl.info(
                { orderId, status: order.status },
                "Order already in terminal state, skipping processing webhook",
              );
              return;
            }

            await tx
              .update(ordersTable)
              .set({
                status: OrderStatus.PROCESSING,
                paymentIntent: event.data.object,
              })
              .where(eq(ordersTable.id, orderId));
          });

          return c.json({ received: true });
        } catch (error) {
          pl.error(error, "Failed to update order status");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update order status",
            }),
          });
        }
      case "payment_intent.requires_action":
        pl.debug(
          event.data.object,
          "PaymentIntent requires_action webhook received",
        );
        try {
          await db.transaction(async (tx) => {
            const orderArr = await tx
              .select()
              .from(ordersTable)
              .where(eq(ordersTable.id, orderId))
              .for("update");

            if (!orderArr[0]) {
              pl.warn(
                { orderId },
                "Order not found for requires_action webhook",
              );
              return;
            }

            const [order] = orderArr;

            const terminalStatuses: OrderStatus[] = [
              OrderStatus.EXPIRED,
              OrderStatus.CANCELED,
              OrderStatus.SUCCEEDED,
            ];

            if (terminalStatuses.includes(order.status)) {
              pl.info(
                { orderId, status: order.status },
                "Order already in future/terminal state, skipping requires_action webhook",
              );
              return;
            }

            await tx
              .update(ordersTable)
              .set({
                status: OrderStatus.REQUIRES_ACTION,
                paymentIntent: event.data.object,
              })
              .where(eq(ordersTable.id, orderId));
          });

          return c.json({ received: true });
        } catch (error) {
          pl.error(error, "Failed to update order status");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update order status",
            }),
          });
        }
      default:
        pl.error(
          event.data.object,
          `Unhandled event type ${event.type} received`,
        );
    }

    return c.json({ received: true });
  })
  .onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    } else {
      pl.error(error, "Unhandled error occurred");
      throw new HTTPException(500, {
        res: new CustomErrorResponse({
          message: "Internal Server Error",
        }),
      });
    }
  });

export { app };

// TODO: add more stripe status to enums
// TODO: handle active status of bull job
