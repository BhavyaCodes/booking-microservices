import { BasePublisher } from "./base-publisher";
import { TicketCreatedEvent } from "./events";
import { Subjects } from "./subjects";

export class TicketCreatedPublisher extends BasePublisher<TicketCreatedEvent> {
  readonly subject = Subjects.TicketCreated;
}
