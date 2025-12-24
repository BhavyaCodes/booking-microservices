import { Subjects } from "./subjects";

interface Event {
  subject: Subjects;
  data: Record<string, any>;
}

export type TicketCreatedEvent = {
  subject: Subjects.TicketCreated;
  data: {
    id: string;
    price: number;
    seatCategoryId: string;
  }[];
};
