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
  HTTPException,
  zodValidationHook,
} from "@booking/common";
import { pl } from "./logger";
import Stripe from "stripe";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { countryCodes } from "./utils/country-iso-3166-1-alpha-2";
import { upsertStripeCustomer } from "./utils/stripe";

const stripe = new Stripe(process.env.ORDERS_STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

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
            .where(eq(ordersTable.id, orderId))
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
  .get("/api/orders/:orderId/status", requireAuth, async (c) => {
    const { orderId } = c.req.param();
    const userId = c.get("currentUser")!.id;

    const order = await db.query.ordersTable.findFirst({
      where(fields, { eq, and }) {
        return and(eq(fields.id, orderId), eq(fields.userId, userId));
      },
    });

    if (!order) {
      throw new HTTPException(404, {
        res: new CustomErrorResponse({
          message: "Order not found",
        }),
      });
    }

    const orderStatus = order.status;

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

    if (!checkOrderStatus[orderStatus]) {
      return c.json({ order });
    }

    // fetch latest payment intent status from Stripe
    if (!order.paymentIntent) {
      pl.error(
        { orderId },
        "Order is in a pending state but missing payment intent",
      );
      throw new HTTPException(500, {
        res: new CustomErrorResponse({
          message: "Order is in a pending state but missing payment intent",
        }),
      });
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(
      order.paymentIntent.id,
    );

    pl.debug(
      { checkOrderStatus, paymentIntentStatus: paymentIntent.status },
      "Stripe payment intent status",
    );

    if (!(paymentIntent.status in checkOrderStatus)) {
      pl.error(
        { paymentIntent, paymentIntentStatus: paymentIntent.status },
        `Unknown Stripe payment intent status ${paymentIntent.status} received`,
      );
      throw new HTTPException(500, {
        res: new CustomErrorResponse({
          message: `Unknown payment intent status ${paymentIntent.status}`,
        }),
      });
    }

    // update status in database if it has changed

    const updatedOrder = await db
      .update(ordersTable)
      .set({
        // status:
        status: paymentIntent.status as OrderStatus,
        paymentIntent,
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          notInArray(ordersTable.status, [
            OrderStatus.EXPIRED,
            OrderStatus.CANCELED,
            OrderStatus.SUCCEEDED,
          ]),
        ),
      )
      .returning();

    return c.json({ order: updatedOrder });
  })
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
        try {
          await db
            .update(ordersTable)
            .set({ status: OrderStatus.SUCCEEDED })
            .where(eq(ordersTable.id, orderId));

          return c.json({ received: true });
        } catch (error) {
          pl.error(error, "Failed to update order status");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update order status",
            }),
          });
        }

      case "payment_intent.payment_failed":
        pl.debug(
          event.data.object,
          "PaymentIntent payment_failed webhook received",
        );

        try {
          await db
            .update(ordersTable)
            .set({ status: OrderStatus.CANCELED })
            .where(eq(ordersTable.id, event.data.object.metadata.orderId));

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
          await db
            .update(ordersTable)
            .set({ status: OrderStatus.CANCELED })
            .where(eq(ordersTable.id, event.data.object.metadata.orderId));
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
          await db
            .update(ordersTable)
            .set({ status: OrderStatus.PROCESSING })
            .where(eq(ordersTable.id, event.data.object.metadata.orderId));
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
          await db
            .update(ordersTable)
            .set({ status: OrderStatus.REQUIRES_ACTION })
            .where(eq(ordersTable.id, event.data.object.metadata.orderId));
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
        pl.warn(
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
