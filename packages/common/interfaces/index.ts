import type { UserRoles } from "./user-roles";

export * from "./user-roles";

export type CurrentUser = {
  id: string;
  role: UserRoles;
};
