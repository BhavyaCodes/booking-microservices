import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.NODE_ENV === "test"
    ? "postgresql://test:test@localhost:5432/test"
    : `postgresql://${process.env.TICKETS_POSTGRES_USER}:${process.env.TICKETS_POSTGRES_PASSWORD}@tickets-postgres-srv:5432/${process.env.TICKETS_POSTGRES_DB}`;

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, {
  casing: "snake_case",
  schema,
});

export type TicketsTxn = Parameters<Parameters<typeof db.transaction>[0]>[0];
