import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.NODE_ENV === "test"
    ? "postgresql://test:test@localhost:5432/test"
    : `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@tickets-postgres-srv:5432/${process.env.POSTGRES_DB}`;

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, {
  casing: "snake_case",
  schema,
});
