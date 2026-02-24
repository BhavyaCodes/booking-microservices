import { BaseListener, OrderExpiredEvent, Subjects } from "@booking/common";
import { JsMsg } from "@nats-io/jetstream/lib/jsmsg";
import { pl } from "../logger";
import { db } from "../db";
import { ticketsTable } from "../db/schema";
import { inArray } from "drizzle-orm";

export class OrderExpiredListener extends BaseListener<OrderExpiredEvent> {
  readonly subject = Subjects.OrderExpired;
  readonly stream = "booking";
  readonly durableName = "tickets-service-durable";

  async onMessage(msg: JsMsg) {
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
}
