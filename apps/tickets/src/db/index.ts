import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@tickets-postgres-srv:5432/${process.env.POSTGRES_DB}`,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { casing: "snake_case" });
