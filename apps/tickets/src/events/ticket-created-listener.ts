import { BaseListener, Subjects, TicketCreatedEvent } from "@booking/common";
import { JsMsg } from "@nats-io/jetstream/lib/jsmsg";

export class TicketCreatedListener extends BaseListener<TicketCreatedEvent> {
  readonly subject = Subjects.TicketsCreated;
  readonly stream = "booking";

  onMessage(msg: JsMsg) {
    // console.log(process.env.POD_NAME);
    // console.log("🚀 ~ TicketCreatedListener ~ onMessage ~ msg:", msg.json());
    msg.ack();
  }
}
