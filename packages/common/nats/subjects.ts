type SubjectPrefix = "auth" | "tickets";
export type Subject = `${SubjectPrefix}.${string}`;

export enum Subjects {
  TicketsCreated = "tickets.created",
  TicketsUpdated = "tickets.updated",
  TicketsReserved = "tickets.reserved",
}

// Type-level constraint: ensures all enum values conform to Subject type
const _validateSubjects: Record<keyof typeof Subjects, Subject> = Subjects;
void _validateSubjects;
