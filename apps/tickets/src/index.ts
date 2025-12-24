import { db, pool } from "./db";
import { app } from "./app";
import { sql } from "drizzle-orm";
import { natsWrapper } from "./nats-wrapper";
import { TicketCreatedListener } from "./events/ticket-created-listener";
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

  try {
    await natsWrapper.connect(
      "nats://nats-jetstream-srv:4222",
      "tickets-publisher",
    );
    console.log("🚀 ~ connected to NATS JetStream!!");

    natsWrapper.nc.closed().then((err) => {
      console.error("NATS connection closed", err);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to connect to NATS JetStream", error);
    process.exit(1);
  }

  new TicketCreatedListener(natsWrapper.js).listen();

  await db.execute(sql`SELECT 1`).catch(() => {
    console.error("Failed to connect to Postgres");
    process.exit(-1);
  });
  console.log("🚀 ~ connected to Postgres");

  Bun.serve({
    port: 3000,
    fetch: app.fetch,
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("SIGINT received, closing NATS connection...");
    await natsWrapper.nc.drain();
    await pool.end();
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, closing NATS connection...");
    await natsWrapper.nc.drain();
    await pool.end();
  });
};

main().catch((err) => {
  console.error("Failed to start the application", err);
  process.exit(1);
});
