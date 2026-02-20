import { hc } from "hono/client";
import type { app } from "./app";

type AppType = typeof app;

export { type AppType as OrdersAppType, hc };
