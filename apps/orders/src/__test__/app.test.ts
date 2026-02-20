import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { ordersTable } from "../db/schema";
import { db } from "../db";
import { UserRoles } from "@booking/common/interfaces";
import { testClient } from "hono/testing";
import { app as ordersApp } from "../app";
import { pl } from "../logger";

const client = testClient(ordersApp);

describe("get pending orders", () => {
  it("should get pending order for current user", async () => {
    const userId = uuidv7();

    const orderPayload: typeof ordersTable.$inferInsert = {
      amount: 150,
      expiresAt: new Date(),
      ticketIds: [uuidv7()],
      userId,
    };

    await db.insert(ordersTable).values(orderPayload);

    // create order for user A
    const cookie = await global.signin({ id: userId, role: UserRoles.USER });

    // call GET /api/orders/pending as user A
    const response = await client.api.orders.pending.$get(
      {},
      {
        headers: {
          Cookie: cookie,
        },
      },
    );

    // expect to get the created order
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toBeDefined();
    expect(responseBody.order!.userId).toBe(userId);
    expect(responseBody.order!.amount).toBe(150);
  });

  it("should return null if no pending order for current user", async () => {
    const cookie = await global.signin({ role: UserRoles.USER });

    // call GET /api/orders/pending as a user with no orders
    const response = await client.api.orders.pending.$get(
      {},
      {
        headers: {
          Cookie: cookie,
        },
      },
    );

    // expect to get null
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.order).toBeNull();
  });

  it("should not return pending orders of other users", async () => {
    const userAId = uuidv7();
    const userBId = uuidv7();

    const orderPayload: typeof ordersTable.$inferInsert = {
      amount: 200,
      expiresAt: new Date(),
      ticketIds: [uuidv7()],
      userId: userAId,
    };

    await db.insert(ordersTable).values(orderPayload);

    // create order for user A
    const cookie = await global.signin({ id: userBId, role: UserRoles.USER });

    // call GET /api/orders/pending as user B
    const response = await client.api.orders.pending.$get(
      {},
      {
        headers: {
          Cookie: cookie,
        },
      },
    );

    // expect to get null since user B has no orders
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.order).toBeNull();
  });
});

describe("create payment intent for order", () => {
  it("should create payment intent for an existing order without payment intent", async () => {
    const userId = uuidv7();

    const orderPayload: typeof ordersTable.$inferInsert = {
      amount: 300,
      expiresAt: new Date(),
      ticketIds: [uuidv7()],
      userId,
    };

    const insertedOrders = await db
      .insert(ordersTable)
      .values(orderPayload)
      .returning();

    const orderId = insertedOrders[0].id;

    const cookie = await global.signin({ id: userId, role: UserRoles.USER });

    // call POST /api/orders/:orderId/create-payment-intent

    const response = await client.api.orders["create-payment-intent"][
      ":orderId"
    ].$post(
      {
        param: {
          orderId,
        },
        json: {
          name: "John Doe",
          address: {
            line1: "123 Main St",
            city: "San Francisco",
            state: "CA",
            postal_code: "94103",
            country: "US",
          },
        },
      },

      {
        headers: {
          Cookie: cookie,
        },
      },
    );

    // expect payment intent to be created
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    pl.debug(responseBody, "Payment Intent Response Body");
    expect(responseBody.order).toBeDefined();
    expect(responseBody.order.paymentIntent).toBeDefined();
    expect(responseBody.order.paymentIntent?.amount).toBe(300);
  });
});
