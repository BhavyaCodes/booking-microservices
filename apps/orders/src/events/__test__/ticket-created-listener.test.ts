import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../nats-wrapper");
import { TicketCreatedListener } from "../ticket-created-listener";
import { natsWrapper as realNatsWrapper } from "../../nats-wrapper";
import { db } from "../../db";
import { ticketsTable } from "../../db/schema";
import { v7 as uuidv7 } from "uuid";
import { eq } from "drizzle-orm";

type MockedNatsWrapper =
  typeof import("../../__mocks__/nats-wrapper").natsWrapper;
const natsWrapper = realNatsWrapper as unknown as MockedNatsWrapper;

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("ticket-created-listener test", () => {
  beforeEach(() => {
    natsWrapper.__reset();
  });

  it("should be able to create instances of TicketCreatedListener", () => {
    const ticketCreatedListener = new TicketCreatedListener(natsWrapper.js);
    ticketCreatedListener.listen();
    expect(true).toBe(true);
  });

  it("persists tickets from TicketCreatedEvent and acks", async () => {
    const listener = new TicketCreatedListener(natsWrapper.js);
    await listener.listen();

    const ack = vi.fn();

    const payload = [
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 42,
        date: new Date().toISOString(),
      },
    ];

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ticketsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(payload[0].id);
    expect(rows[0].seatCategoryId).toBe(payload[0].seatCategoryId);
    expect(rows[0].price).toBe(42);
    expect(ack).toHaveBeenCalledOnce();
  });

  it("does not insert duplicate tickets on re-delivery", async () => {
    const listener = new TicketCreatedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const payload = [
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 100,
        date: new Date().toISOString(),
      },
    ];

    const msg = {
      json: () => payload,
      ack,
    } as any;

    // First delivery
    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    // Second delivery (duplicate)
    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ticketsTable);

    expect(rows).toHaveLength(1); // Should still be only one ticket
    expect(rows[0].id).toBe(payload[0].id);
    expect(ack).toHaveBeenCalledTimes(2); // Ack should be called for both deliveries
  });

  it("should not ack if DB insert fails", async () => {
    const listener = new TicketCreatedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const payload = [
      {
        id: "invalid-uuid", // Invalid UUID to cause DB insert failure
        seatCategoryId: uuidv7(),
        price: 50,
        date: new Date().toISOString(),
      },
    ];

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    expect(ack).not.toHaveBeenCalled(); // Ack should not be called due to insert failure
  });

  it("handles multiple tickets in a single TicketCreatedEvent", async () => {
    const listener = new TicketCreatedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const payload = [
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 75,
        date: new Date().toISOString(),
      },
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 85,
        date: new Date().toISOString(),
      },
    ];

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ticketsTable);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === payload[0].id)).toBeDefined();
    expect(rows.find((r) => r.id === payload[1].id)).toBeDefined();
    expect(ack).toHaveBeenCalledOnce();
  });

  it("should not write to the database if there is conflict on insert", async () => {
    const listener = new TicketCreatedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const existingTicket = {
      id: uuidv7(),
      seatCategoryId: uuidv7(),
      price: 60,
      date: new Date().toISOString(),
    };

    // Insert the existing ticket directly into the database
    await db.insert(ticketsTable).values({
      id: existingTicket.id,
      seatCategoryId: existingTicket.seatCategoryId,
      price: existingTicket.price,
      date: new Date(existingTicket.date),
    });

    const payload = [
      existingTicket, // This will cause a conflict
    ];

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, existingTicket.id));

    expect(rows).toHaveLength(1); // Still only one ticket
    expect(rows[0].id).toBe(existingTicket.id);
    expect(ack).toHaveBeenCalledOnce();
  });

  it("should handle partial conflicts", async () => {
    const listener = new TicketCreatedListener(natsWrapper.js);
    await listener.listen();
    const ack = vi.fn();

    const existingTickets = Array.from({ length: 3 }).map((_, idx) => ({
      id: uuidv7(),
      seatCategoryId: uuidv7(),
      price: (idx + 1) * 10,
      date: new Date(),
    }));

    await db.insert(ticketsTable).values(
      existingTickets.map((t) => ({
        ...t,
        date: new Date(t.date),
      })),
    );

    const payload = [
      {
        id: existingTickets[0].id, // duplicate with existing ticket
        seatCategoryId: uuidv7(),
        price: 10,
        date: new Date().toISOString(),
      },
      {
        id: existingTickets[1].id, // duplicate with existing ticket
        seatCategoryId: uuidv7(),
        price: 15,
        date: new Date().toISOString(),
      },
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 20,
        date: new Date().toISOString(),
      },
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 25,
        date: new Date().toISOString(),
      },
      {
        id: uuidv7(),
        seatCategoryId: uuidv7(),
        price: 30,
        date: new Date().toISOString(),
      },
    ];

    const msg = {
      json: () => payload,
      ack,
    } as any;

    await natsWrapper.__triggerMessage(msg);
    await flushAsync();

    const rows = await db.select().from(ticketsTable);

    expect(rows).toHaveLength(3 + 3); // 3 existing + 3 unique inserts (duplicates ignored)
    expect(ack).toHaveBeenCalledOnce();
  });
});
