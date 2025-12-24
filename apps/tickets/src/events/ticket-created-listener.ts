import { JsMsg } from "nats";
import { BaseListener } from "./base-listener";
import { TicketCreatedEvent } from "./events";
import { Subjects } from "./subjects";

export class TicketCreatedListener extends BaseListener<TicketCreatedEvent> {
  readonly subject = Subjects.TicketCreated;
  readonly stream = "booking";

  onMessage(msg: JsMsg) {
    msg.ack();
  }
}
