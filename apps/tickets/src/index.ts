import { db } from "./db";
import { app } from "./app";
import { sql } from "drizzle-orm";

const main = async () => {
  if (!process.env.JWT_KEY) {
    throw new Error("JWT_KEY must be present");
  }

  if (
    !process.env.POSTGRES_USER ||
    !process.env.POSTGRES_PASSWORD ||
    !process.env.POSTGRES_DB
  ) {
    throw new Error("Postgres environment variables must be set");
  }

  await db.execute(sql`SELECT 1`).catch(() => {
    console.error("Failed to connect to Postgres");
    process.exit(-1);
  });
  console.log("🚀 ~ connected to Postgres");

  Bun.serve({
    port: 3000,
    fetch: app.fetch,
  });
};

main().catch((err) => {
  console.error("Failed to start the application", err);
  process.exit(1);
});
