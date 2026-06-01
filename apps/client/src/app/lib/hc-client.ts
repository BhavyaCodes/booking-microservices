import { AuthAppType, hc } from "@booking/auth/client";

export const hcAuthClient = hc<AuthAppType>(process.env.NEXT_PUBLIC_BASE_URL!);
