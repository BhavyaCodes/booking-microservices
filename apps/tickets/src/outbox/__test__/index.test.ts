import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { db, pool } from "../../db";
import * as outbox from "../index";
import { Subjects } from "@booking/common";
import { pl } from "../../logger";
import { PoolClient } from "pg";
import { outboxTable } from "../../db/schema";
import { eq } from "drizzle-orm";

vi.mock("../index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../index")>();
  return {
    ...actual,
    outboxPublisher: vi.fn().mockResolvedValue(undefined),
  };
});

let notifClient: PoolClient;

beforeEach(async () => {
  await db.delete(outboxTable);
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

beforeAll(async () => {
  // Listen for PostgreSQL notifications
  notifClient = await pool.connect();
  await notifClient.query("LISTEN outbox_insert");
  pl.trace("🚀 ~ listening for outbox_insert notifications");

  notifClient.on("notification", (msg) => {
    if (msg.channel === "outbox_insert") {
      outbox.outboxPublisher().catch((err) => {
        pl.error(err, "Failed to process outbox events");
      });
    }
  });

  // wait a moment to ensure listener is set up
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

afterAll(async () => {
  // if (notifClient) {
  await notifClient.query("UNLISTEN outbox_insert");
  notifClient.release();
  // }
});

describe("Outbox Module", () => {
  expect(outbox.outboxPublisher).not.toHaveBeenCalled();

  it("should run outboxPublisher when addEventToOutBox is called", async () => {
    await db.transaction(async (tx) => {
      await outbox.addEventToOutBox(tx, {
        subject: Subjects.TicketsCreated,
        data: [
          {
            id: "test-id",
            price: 100,
            seatCategoryId: "test-seat-category-id",
          },
        ],
      });
    });

    // Wait for the notification to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(outbox.outboxPublisher).toHaveBeenCalled();
  });

  it("Should add event to outbox table", async () => {
    const id = "test-id-2";
    const seatCategoryId = "test-seat-category-id-2";
    const price = 150;

    const id2 = "test-id-3";
    const seatCategoryId2 = "test-seat-category-id-3";
    const price2 = 200;

    const data = [
      {
        id: id,
        price: price,
        seatCategoryId: seatCategoryId,
      },
      {
        id: id2,
        price: price2,
        seatCategoryId: seatCategoryId2,
      },
    ];

    await db.transaction(async (tx) => {
      await outbox.addEventToOutBox(tx, {
        subject: Subjects.TicketsCreated,
        data,
      });

      const rows = await tx
        .select()
        .from(outboxTable)
        .where(eq(outboxTable.data, data));

      expect(rows.length).toBe(1);
      expect(rows[0].subject).toBe(Subjects.TicketsCreated);
      expect(rows[0].processed).toBe(false);
      expect(rows[0].data).toEqual(data);
      expect(rows[0]).toEqual({
        id: expect.any(String),
        processed: false,
        subject: Subjects.TicketsCreated,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: id,
            price: price,
            seatCategoryId: seatCategoryId,
          }),
          expect.objectContaining({
            id: id2,
            price: price2,
            seatCategoryId: seatCategoryId2,
          }),
        ]),
      });
    });

    expect(true).toBe(true);
  });
});
