type SubjectPrefix = "auth" | "tickets" | "orders";
export type Subject = `${SubjectPrefix}.${string}`;

export enum Subjects {
  TicketsCreated = "tickets.created",
  TicketsUpdated = "tickets.updated",
  TicketsReserved = "tickets.reserved",

  OrderExpired = "orders.expired",
}

// Type-level constraint: ensures all enum values conform to Subject type
const _validateSubjects: Record<keyof typeof Subjects, Subject> = Subjects;
void _validateSubjects;
