import { db, pool } from "./db";
import { app } from "./app";
import { sql } from "drizzle-orm";
import { natsWrapper } from "./nats-wrapper";
import { outboxPublisher } from "./outbox";
import { pl } from "./logger";
import { handleOrderExpired } from "./events/order-expired-handler";
import { MessageDispatcher, Subjects } from "@booking/common";
import { handleOrderConfirmed } from "./events/order-confirmed-handler";

const main = async () => {
  if (!process.env.JWT_KEY) {
    throw new Error("JWT_KEY must be present");
  }

  if (
    !process.env.TICKETS_POSTGRES_USER ||
    !process.env.TICKETS_POSTGRES_PASSWORD ||
    !process.env.TICKETS_POSTGRES_DB
  ) {
    throw new Error("Postgres environment variables must be set");
  }

  try {
    await natsWrapper.connect("nats://nats-jetstream-srv:4222");
    pl.info("🚀 ~ connected to NATS JetStream!!");

    natsWrapper.nc.closed().then(async (err) => {
      pl.error(err, "NATS connection closed");
    });
  } catch (error) {
    pl.error(error, "Failed to connect to NATS JetStream");
    process.exit(1);
  }

  const dispatcher = new MessageDispatcher(
    natsWrapper.js,
    "booking",
    "tickets-service-durable",
  );
  dispatcher.on(Subjects.OrderExpired, handleOrderExpired);
  dispatcher.on(Subjects.OrderConfirmed, handleOrderConfirmed);
  dispatcher.listen();

  await db.execute(sql`SELECT 1`).catch((err) => {
    pl.fatal(err, "Failed to connect to Postgres");
    process.exit(-1);
  });
  pl.info("🚀 ~ connected to Postgres");

  // Listen for PostgreSQL notifications
  const notifClient = await pool.connect();
  await notifClient.query("LISTEN outbox_insert");
  pl.trace("🚀 ~ listening for outbox_insert notifications");

  notifClient.on("notification", (msg) => {
    pl.debug("Received pg notification");
    if (msg.channel === "outbox_insert") {
      outboxPublisher()
        .catch((err) => {
          pl.error(err, "Failed to process outbox events");
        })
        .finally(() => {
          pl.debug("Finished processing outbox events");
        });
    }
  });

  const cleanup = async () => {
    notifClient.query("UNLISTEN outbox_insert").catch((err) => {
      pl.error(err, "Failed to unlisten outbox_insert");
    });
    notifClient.release();
    natsWrapper.nc.drain().catch((err) => {
      pl.error(err, "Failed to drain NATS connection");
    });
    pool.end().catch((err) => {
      pl.error(err, "Failed to end Postgres connection pool");
    });
  };

  Bun.serve({
    port: 3000,
    fetch: app.fetch,
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    pl.info("SIGINT received");
    await cleanup();
  });

  process.on("SIGTERM", async () => {
    pl.info("SIGTERM received");
    await cleanup();
  });
};

main().catch((err) => {
  pl.fatal(err, "Failed to start the application");
  process.exit(1);
});
