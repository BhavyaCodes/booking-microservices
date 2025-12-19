import { pool } from "./db";
import { app } from "./app";

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

  pool.connect().then(() => {
    console.log("🚀 Connected to Postgres");

    Bun.serve({
      port: 3000,
      fetch: app.fetch,
    });
  });

  pool.on("error", (err) => {
    console.error("Unexpected error on idle Postgres client", err);
    process.exit(-1);
  });
};

main().catch((err) => {
  console.error("Failed to start the application", err);
  process.exit(1);
});
