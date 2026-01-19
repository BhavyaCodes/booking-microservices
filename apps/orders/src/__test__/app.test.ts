import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { ordersTable } from "../db/schema";
import { db } from "../db";
import { UserRoles } from "@booking/common/interfaces";
import { testClient } from "hono/testing";
import { app as ordersApp } from "../app";

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
});
