import { db, pool } from "./db";
import { app } from "./app";
import { sql } from "drizzle-orm";
import { natsWrapper } from "./nats-wrapper";
import { TicketCreatedListener } from "./events/ticket-created-listener";
import { outboxPublisher } from "./outbox";

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
    await natsWrapper.connect("nats://nats-jetstream-srv:4222");
    console.log("🚀 ~ connected to NATS JetStream!!");

    natsWrapper.nc.closed().then(async (err) => {
      console.error("NATS connection closed", err);
      // await cleanup();
      // process.exit(1);
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

  // Listen for PostgreSQL notifications
  const notifClient = await pool.connect();
  await notifClient.query("LISTEN outbox_insert");
  console.log("🚀 ~ listening for outbox_insert notifications");

  notifClient.on("notification", (msg) => {
    if (msg.channel === "outbox_insert") {
      outboxPublisher().catch((err) => {
        console.error("Failed to process outbox events", err);
      });
    }
  });

  const cleanup = async () => {
    await notifClient.query("UNLISTEN outbox_insert");
    await notifClient.release();
    await natsWrapper.nc.drain();
    await pool.end();
  };

  Bun.serve({
    port: 3000,
    fetch: app.fetch,
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("SIGINT received");
    await cleanup();
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received");
    await cleanup();
  });
};

main().catch((err) => {
  console.error("Failed to start the application", err);
  process.exit(1);
});
