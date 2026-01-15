import { BaseListener, Subjects, TicketsReservedEvent } from "@booking/common";
import { JsMsg } from "@nats-io/jetstream/lib/jsmsg";
import { arrayOverlaps, and, notInArray } from "drizzle-orm";
import { pl } from "../logger";
import { db } from "../db";
import { ordersTable, OrderStatus } from "../db/schema";

export class TicketsReservedListener extends BaseListener<TicketsReservedEvent> {
  readonly subject = Subjects.TicketsReserved;
  readonly stream = "booking";
  readonly durableName = "orders-service-durable";

  async onMessage(msg: JsMsg) {
    pl.trace(
      { podName: process.env.POD_NAME, message: msg.json() },
      "TicketsReserved event received",
    );

    // get unique id from NATS message to ensure idempotency
    // const natsMessageId = msg.headers.get("Nats-Msg-Id");

    const data = msg.json<TicketsReservedEvent["data"]>();
    pl.trace({ data }, "TicketsReserved event data");

    const dbData: typeof ordersTable.$inferInsert = {
      userId: data.userId,
      amount: data.amount,
      expiresAt: new Date(data.expiresAt),
      ticketIds: data.ticketIds,
    };

    try {
      await db.transaction(async (tx) => {
        const overlaps = await tx
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(
            and(
              arrayOverlaps(ordersTable.ticketIds, data.ticketIds),
              notInArray(ordersTable.status, [
                OrderStatus.CANCELED,
                OrderStatus.EXPIRED,
              ]),
            ),
          )
          .limit(1);

        if (overlaps.length > 0) {
          pl.warn(
            { conflictOrderId: overlaps[0].id, ticketIds: data.ticketIds },
            "Rejecting TicketsReserved: one or more tickets already reserved",
          );
          // Business rule violation – acknowledge to stop retries.
          msg.ack();
          return;
        }

        const result = await tx.insert(ordersTable).values(dbData);
        pl.debug(
          { result },
          `Inserted ${result.rowCount} orders from TicketsReserved event`,
        );
        msg.ack();
      });
    } catch (error) {
      pl.error(error, "Failed to process TicketsReserved event");
      const deliveryCount = msg.info?.deliveryCount ?? 0;
      const MAX_REDELIVERIES = 5;
      if (deliveryCount >= MAX_REDELIVERIES) {
        pl.error(
          { deliveryCount: deliveryCount },
          "Max redeliveries reached for TicketsReserved event, acknowledging message to prevent further retries",
        );
        msg.ack();
      } else {
        msg.nak(5000); // wait 5 seconds before redelivery
      }
    }
  }
}
