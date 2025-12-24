import { BaseListener, Subjects, TicketCreatedEvent } from "@booking/common";
import { JsMsg } from "nats";

export class TicketCreatedListener extends BaseListener<TicketCreatedEvent> {
  readonly subject = Subjects.TicketsCreated;
  readonly stream = "booking";

  onMessage(msg: JsMsg) {
    msg.ack();
  }
}
