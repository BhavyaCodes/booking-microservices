import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../nats-wrapper");
import { TicketsReservedListener } from "../tickets-reserved-listener";
import { natsWrapper as realNatsWrapper } from "../../nats-wrapper";
import { db } from "../../db";
import { ordersTable, OrderStatus } from "../../db/schema";
import { v7 as uuidv7 } from "uuid";
import { TicketsReservedEvent } from "@booking/common";

type MockedNatsWrapper =
  typeof import("../../__mocks__/nats-wrapper").natsWrapper;
const natsWrapper = realNatsWrapper as unknown as MockedNatsWrapper;

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("tickets-reserved-listener test", () => {
  beforeEach(() => {
    natsWrapper.__reset();
  });

  it("should be able to create instances of TicketsReservedListener", () => {
    const ticketsReservedListener = new TicketsReservedListener(natsWrapper.js);
    ticketsReservedListener.listen();
    expect(true).toBe(true);
  });

  it("persists orders from TicketsReservedEvent and acks", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();

    const ack = vi.fn();

    const payload: TicketsReservedEvent["data"] = {
      amount: 42,
      ticketIds: [uuidv7(), uuidv7()],
      userId: uuidv7(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ordersTable);
    expect(rows).toHaveLength(1);

    expect(rows[0].amount).toBe(payload.amount);
    expect(rows[0].expiresAt).toEqual(new Date(payload.expiresAt));
    expect(rows[0].ticketIds).toEqual(payload.ticketIds);
    expect(rows[0].userId).toBe(payload.userId);
    expect(ack).toHaveBeenCalledOnce();
  });

  it("should not ack if DB insert fails (negative amount)", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();
    const nak = vi.fn();

    // Mock db.transaction to throw an error
    const originalTransaction = db.transaction;
    vi.spyOn(db, "transaction").mockImplementationOnce(async () => {
      throw new Error("Database error");
    });

    const payload: TicketsReservedEvent["data"] = {
      ticketIds: [uuidv7()],
      userId: uuidv7(),
      amount: 50,
      expiresAt: new Date().toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
      nak,
      info: { deliveryCount: 1 },
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    expect(ack).not.toHaveBeenCalled(); // Ack should not be called due to insert failure
    expect(nak).toHaveBeenCalledWith(5000); // Should nak with 5 second delay

    // Restore original function
    db.transaction = originalTransaction;
  });

  it("should reject reservation if tickets are already reserved in active order", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const sharedTicketId = uuidv7();
    const existingOrder: typeof ordersTable.$inferInsert = {
      userId: uuidv7(),
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ticketIds: [sharedTicketId, uuidv7()],
    };

    // Insert the existing order directly into the database
    await db.insert(ordersTable).values(existingOrder);

    const payload: TicketsReservedEvent["data"] = {
      ticketIds: [sharedTicketId, uuidv7()], // Contains a ticket already in active order
      userId: uuidv7(),
      amount: 50,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ordersTable);

    expect(rows).toHaveLength(1); // Still only one order (the existing one)
    expect(rows[0].ticketIds).toEqual(existingOrder.ticketIds);
    expect(ack).toHaveBeenCalledOnce(); // Should ack to prevent retries
  });

  it("should allow reservation if conflicting order is canceled", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const sharedTicketId = uuidv7();
    const canceledOrder: typeof ordersTable.$inferInsert = {
      userId: uuidv7(),
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ticketIds: [sharedTicketId, uuidv7()],
      status: OrderStatus.CANCELED,
    };

    await db.insert(ordersTable).values(canceledOrder);

    const payload: TicketsReservedEvent["data"] = {
      ticketIds: [sharedTicketId, uuidv7()],
      userId: uuidv7(),
      amount: 50,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ordersTable);

    expect(rows).toHaveLength(2); // Both orders should exist
    expect(ack).toHaveBeenCalledOnce();
  });

  it("should allow reservation if conflicting order is expired", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const sharedTicketId = uuidv7();
    const expiredOrder: typeof ordersTable.$inferInsert = {
      userId: uuidv7(),
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ticketIds: [sharedTicketId, uuidv7()],
      status: OrderStatus.EXPIRED,
    };

    await db.insert(ordersTable).values(expiredOrder);

    const payload: TicketsReservedEvent["data"] = {
      ticketIds: [sharedTicketId, uuidv7()],
      userId: uuidv7(),
      amount: 50,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ordersTable);

    expect(rows).toHaveLength(2); // Both orders should exist
    expect(ack).toHaveBeenCalledOnce();
  });

  it("should ack after max redeliveries even on persistent failure", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();
    const nak = vi.fn();

    // Mock db.transaction to throw an error
    const originalTransaction = db.transaction;
    vi.spyOn(db, "transaction").mockImplementationOnce(async () => {
      throw new Error("Persistent database error");
    });

    const payload: TicketsReservedEvent["data"] = {
      ticketIds: [uuidv7()],
      userId: uuidv7(),
      amount: 50,
      expiresAt: new Date().toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
      nak,
      info: { deliveryCount: 5 }, // At max retries
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    expect(ack).toHaveBeenCalledOnce(); // Should ack to prevent infinite retries
    expect(nak).not.toHaveBeenCalled();

    // Restore original function
    db.transaction = originalTransaction;
  });

  it("should handle multiple non-overlapping reservations", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const payload1: TicketsReservedEvent["data"] = {
      ticketIds: [uuidv7(), uuidv7()],
      userId: uuidv7(),
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const payload2: TicketsReservedEvent["data"] = {
      ticketIds: [uuidv7(), uuidv7()],
      userId: uuidv7(),
      amount: 200,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const msg1 = {
      json: () => payload1,
      ack,
    } as any;

    const msg2 = {
      json: () => payload2,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg1);
    await flushAsync();
    await natsWrapper.__triggerMessage(msg2);
    await flushAsync();

    const rows = await db.select().from(ordersTable);

    expect(rows).toHaveLength(2);
    expect(ack).toHaveBeenCalledTimes(2);
  });

  it("should reject partial overlaps in ticket reservations", async () => {
    const listener = new TicketsReservedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const sharedTicket = uuidv7();
    const existingOrder: typeof ordersTable.$inferInsert = {
      userId: uuidv7(),
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      ticketIds: [sharedTicket, uuidv7(), uuidv7()],
    };

    await db.insert(ordersTable).values(existingOrder);

    const payload: TicketsReservedEvent["data"] = {
      ticketIds: [uuidv7(), sharedTicket, uuidv7()], // One overlapping ticket
      userId: uuidv7(),
      amount: 50,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ordersTable);

    expect(rows).toHaveLength(1); // Only the existing order
    expect(ack).toHaveBeenCalledOnce(); // Should ack to prevent retries
  });
});
