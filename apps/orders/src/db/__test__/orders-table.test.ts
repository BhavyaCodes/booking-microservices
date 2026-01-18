import { describe, expect, it } from "vitest";
import { ordersTable, OrderStatus } from "../schema";
import { v7 as uuidv7 } from "uuid";
import { db } from "..";
import { fa } from "zod/v4/locales";

describe("orders-table", () => {
  it("should have status of CREATED by default", async () => {
    const payload: typeof ordersTable.$inferInsert = {
      amount: 100,
      expiresAt: new Date(),
      ticketIds: [uuidv7(), uuidv7()],
      userId: uuidv7(),
    };

    const newOrder = await db.insert(ordersTable).values(payload).returning();

    expect(newOrder[0].status).toBe(OrderStatus.CREATED);
  });

  it("should not be able to store multiple created orders for the same user", async () => {
    const userId = uuidv7();
    const payload1: typeof ordersTable.$inferInsert = {
      amount: 100,
      expiresAt: new Date(),
      ticketIds: [uuidv7(), uuidv7()],
      userId,
    };

    const payload2: typeof ordersTable.$inferInsert = {
      amount: 200,
      expiresAt: new Date(),
      ticketIds: [uuidv7()],
      userId,
    };

    await db.insert(ordersTable).values(payload1);

    try {
      await db.insert(ordersTable).values(payload2);
      expect(false).toBe(true); // This line should not be reached
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
