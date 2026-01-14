import type { DateISOString } from "../interfaces";
import { Subjects } from "./subjects";

export type TicketCreatedEvent = {
  subject: Subjects.TicketsCreated;
  data: {
    id: string;
    price: number;
    seatCategoryId: string;
    date: DateISOString;
  }[];
};

export type TicketsReservedEvent = {
  subject: Subjects.TicketsReserved;
  data: {
    ticketId: string;
    userId: string;
    expiresAt: DateISOString;
  }[];
};

export type NATSEvent = TicketCreatedEvent | TicketsReservedEvent;
