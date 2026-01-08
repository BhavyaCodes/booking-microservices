import type { UserRoles } from "./user-roles";

export * from "./user-roles";

export type CurrentUser = {
  id: string;
  role: UserRoles;
};

export type DateISOString = string; // e.g., "2023-10-05T14:48:00.000Z"
