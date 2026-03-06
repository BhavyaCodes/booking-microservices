import type { DateISOString, UuidString } from "../interfaces";
import { Subjects } from "./subjects";

export type TicketsReservedEvent = {
  subject: Subjects.TicketsReserved;
  data: {
    ticketIds: string[];
    userId: string;
    amount: number;
    expiresAt: DateISOString;
    // TODO: Additional fields can be added as needed
    // e.g., individual ticket details, better invoice, etc.
  };
};

export type OrderExpiredEvent = {
  subject: Subjects.OrderExpired;
  data: {
    orderId: UuidString;
    ticketIds: string[];
  };
};

export type NATSEvent = TicketsReservedEvent | OrderExpiredEvent;
