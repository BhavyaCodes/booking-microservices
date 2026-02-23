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
import { Subjects, TicketsReservedEvent } from "@booking/common";
import { pl } from "../../logger";
import { PoolClient } from "pg";
import { outboxTable } from "../../db/schema";
import { eq } from "drizzle-orm";

let notifClient: PoolClient;

beforeEach(async () => {
  await db.delete(outboxTable);
});

beforeAll(async () => {
  // Listen for PostgreSQL notifications for monitoring
  notifClient = await pool.connect();
  await notifClient.query("LISTEN outbox_insert");
  pl.trace("🚀 ~ listening for outbox_insert notifications");

  // Don't call outboxPublisher here - just monitor notifications
  notifClient.on("notification", (msg) => {
    if (msg.channel === "outbox_insert") {
      pl.trace("Notification received for outbox_insert");
    }
  });

  // wait a moment to ensure listener is set up
  await new Promise((resolve) => setTimeout(resolve, 500));
});

afterAll(async () => {
  if (notifClient) {
    await notifClient.query("UNLISTEN outbox_insert");
    notifClient.release();
  }
});

describe("Outbox Module", () => {
  it("should add event to outbox table", async () => {
    const id = "test-id-2";
    const id2 = "test-id-3";

    const data: TicketsReservedEvent["data"] = {
      amount: 200,
      expiresAt: new Date().toISOString(),
      ticketIds: [id, id2],
      userId: "test-user-id",
    };

    await db.transaction(async (tx) => {
      await outbox.addEventToOutBox(tx, {
        subject: Subjects.TicketsReserved,
        data,
      });

      const rows = await tx
        .select()
        .from(outboxTable)
        .where(eq(outboxTable.data, data));

      expect(rows.length).toBe(1);
      expect(rows[0].subject).toBe(Subjects.TicketsReserved);
      expect(rows[0].processed).toBe(false);
      expect(rows[0].data).toEqual(data);
      expect(rows[0]).toEqual({
        id: expect.any(String),
        processed: false,
        subject: Subjects.TicketsReserved,
        data: expect.objectContaining({
          amount: 200,
          expiresAt: expect.any(String),
          ticketIds: expect.arrayContaining([id, id2]),
          userId: "test-user-id",
        }),
      });
    });
  });
});
