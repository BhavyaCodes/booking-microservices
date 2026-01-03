import { BaseListener, Subjects, TicketCreatedEvent } from "@booking/common";
import { JsMsg } from "@nats-io/jetstream/lib/jsmsg";
import { pl } from "../logger";

export class TicketCreatedListener extends BaseListener<TicketCreatedEvent> {
  readonly subject = Subjects.TicketsCreated;
  readonly stream = "booking";

  onMessage(msg: JsMsg) {
    pl.trace(
      { podName: process.env.POD_NAME, message: msg.json() },
      "TicketCreated event received",
    );
    msg.ack();
  }
}
