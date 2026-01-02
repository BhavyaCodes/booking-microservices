import { asc, eq, inArray } from "drizzle-orm";
import { db, TicketsTxn } from "../db";
import { outboxTable } from "../db/schema";
import { NATSEvent } from "@booking/common";
import { natsWrapper } from "../nats-wrapper";
import { PubAck } from "@nats-io/jetstream/lib/types";

export const outboxPublisher = async () => {
  await db.transaction(async (tx) => {
    const insertedOutboxEvents = await tx
      .select()
      .from(outboxTable)
      .orderBy(asc(outboxTable.id))
      .limit(25)
      .where(eq(outboxTable.processed, false))
      .for("update", { skipLocked: true });

    if (insertedOutboxEvents.length === 0) {
      return;
    }

    const natsQueue = insertedOutboxEvents.map(async (event) => {
      return new Promise<{ docId: string; pa: PubAck }>(
        async (resolve, reject) => {
          try {
            const pa = await natsWrapper.js.publish(
              event.subject,
              JSON.stringify(event.data),
              { msgID: event.id },
            );
            resolve({ docId: event.id, pa });
          } catch (error) {
            console.error("🚀 ~ outboxPublisher ~ event,error:", event, error);

            reject(error);
          }
        },
      );
    });

    const results = await Promise.allSettled(natsQueue);

    /**
     * array to hold outbox IDs of successfully published events
     */
    const successfulPublishesOutboxIds: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        successfulPublishesOutboxIds.push(result.value.docId);
      }
    }

    // update the outbox events as processed
    if (successfulPublishesOutboxIds.length > 0) {
      const result = await tx
        .update(outboxTable)
        .set({ processed: true })
        .where(inArray(outboxTable.id, successfulPublishesOutboxIds));
      console.log("🚀 ~ processed updated to true count:", result.rowCount);
    }

    // await natsWrapper.js.publish();
  });
};

export const addEventToOutBox = async (tx: TicketsTxn, event: NATSEvent) => {
  await tx.insert(outboxTable).values({
    subject: event.subject,
    data: event.data,
    processed: false,
  });
};
