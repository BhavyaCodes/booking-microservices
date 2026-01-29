import type { CurrentUser } from "@booking/common/interfaces";
import { extractCurrentUser, requireAuth } from "@booking/common/middlewares";
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
import { eq } from "drizzle-orm";
import { countryCodes } from "./utils/country-iso-3166-1-alpha-2";
import { upsertStripeCustomer } from "./utils/stripe";

const stripe = new Stripe(process.env.ORDERS_STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
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
            .set({ paymentIntent })
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
  .get("/api/orders/pending", requireAuth, async (c) => {
    const currentUser = c.get("currentUser");

    const pendingOrder = await db.query.ordersTable.findFirst({
      where(fields, { eq, and }) {
        return and(
          eq(fields.userId, currentUser!.id),
          eq(fields.status, OrderStatus.CREATED),
        );
      },
    });

    return c.json({
      order: pendingOrder || null,
    });
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
