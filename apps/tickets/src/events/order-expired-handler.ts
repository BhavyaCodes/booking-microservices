import type { OrderExpiredEvent } from "@booking/common";
import type { JsMsg } from "@nats-io/jetstream/lib/jsmsg";
import { pl } from "../logger";
import { db } from "../db";
import { ticketsTable } from "../db/schema";
import { inArray } from "drizzle-orm";

export async function handleOrderExpired(msg: JsMsg) {
  pl.debug(
    { podName: process.env.POD_NAME, message: msg.json() },
    "OrderExpired event received",
  );

  const data = msg.json<OrderExpiredEvent["data"]>();

  try {
    await db
      .update(ticketsTable)
      .set({
        userId: null,
      })
      .where(inArray(ticketsTable.id, data.ticketIds));
    msg.ack();
  } catch (error) {
    pl.error(error, "Error updating tickets");

    const deliveryCount = msg.info?.deliveryCount ?? 0;
    const MAX_REDELIVERIES = 5;
    if (deliveryCount >= MAX_REDELIVERIES) {
      pl.error(
        { deliveryCount: deliveryCount },
        "Max redeliveries reached for OrderExpired event, acknowledging message to prevent further retries",
      );
      msg.ack();
    } else {
      msg.nak(5000); // wait 5 seconds before redelivery
    }
  }
}
