import { JsMsg } from "@nats-io/jetstream/lib/jsmsg";
import { pl } from "../logger";
import { OrderConfirmedEvent } from "@booking/common";
import { db } from "../db";
import { ticketsTable } from "../db/schema";
import { inArray } from "drizzle-orm";

export async function handleOrderConfirmed(msg: JsMsg) {
  const data = msg.json<OrderConfirmedEvent["data"]>();

  pl.debug(
    { podName: process.env.POD_NAME, message: data },
    "OrderConfirmed event received",
  );

  try {
    await db
      .update(ticketsTable)
      .set({ sold: true })
      .where(inArray(ticketsTable.id, data.ticketIds));

    msg.ack();
  } catch (error) {
    pl.error(
      { podName: process.env.POD_NAME, error },
      "Error occurred while updating ticket status",
    );

    const deliveryCount = msg.info?.deliveryCount ?? 0;
    const MAX_REDELIVERIES = 5;
    if (deliveryCount >= MAX_REDELIVERIES) {
      pl.error(
        { deliveryCount: deliveryCount },
        "Max redeliveries reached for OrderConfirmed event, acknowledging message to prevent further retries",
      );
      msg.ack();
    } else {
      msg.nak(5000); // wait 5 seconds before redelivery
    }
  }
}
