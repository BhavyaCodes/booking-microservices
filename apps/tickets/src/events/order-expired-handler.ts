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
    db.update(ticketsTable)
      .set({
        userId: null,
      })
      .where(inArray(ticketsTable.id, data.ticketIds));
    msg.ack();
  } catch (error) {
    pl.error(error, "Error updating tickets");

    // msg.ack();
  }
}
