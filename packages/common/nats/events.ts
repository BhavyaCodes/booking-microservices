import { Subjects } from "./subjects";

export type TicketCreatedEvent = {
  subject: Subjects.TicketsCreated;
  data: {
    id: string;
    price: number;
    seatCategoryId: string;
  }[];
};
