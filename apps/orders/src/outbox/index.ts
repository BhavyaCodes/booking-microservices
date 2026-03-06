import { asc, eq, inArray } from "drizzle-orm";
import { db, OrdersTxn } from "../db";
import { outboxTable } from "../db/schema";
import { NATSEvent } from "@booking/common";
import { natsWrapper } from "../nats-wrapper";
import { PubAck } from "@nats-io/jetstream/lib/types";
import { pl } from "../logger";

export const outboxPublisher = async () => {
  pl.trace("🚀 ~ outboxPublisher called");
  await db
    .transaction(async (tx) => {
      try {
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
                pl.trace({ event, pa }, "Published outbox event to NATS");
                resolve({ docId: event.id, pa });
              } catch (error) {
                pl.error({ error, event }, "Failed to publish outbox event");

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
          pl.trace("🚀 ~ processed updated to true count:" + result.rowCount);
        }
      } catch (error) {
        pl.error(error, "Error in outboxPublisher transaction");
      }
    })
    .catch((err) => {
      console.error("Failed to process outbox events in transaction", err);
    });
};

export const addEventToOutBox = async <T extends NATSEvent = NATSEvent>(
  tx: OrdersTxn,
  event: T,
) => {
  await tx.insert(outboxTable).values({
    subject: event.subject,
    data: event.data,
    processed: false,
  });
};
