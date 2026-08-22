import { AuthAppType, hc } from "@booking/auth/client";
import { TicketsAppType } from "@booking/tickets/client";

export const hcAuthClient = hc<AuthAppType>(process.env.NEXT_PUBLIC_BASE_URL!);

export const hcTicketsClient = hc<TicketsAppType>(
  process.env.NEXT_PUBLIC_BASE_URL!,
);
