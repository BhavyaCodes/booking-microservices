import { db, pool } from "./db";
import { app } from "./app";
import { sql } from "drizzle-orm";
import { natsWrapper } from "./nats-wrapper";
// import { outboxPublisher } from "./outbox";
import { pl } from "./logger";
import { TicketsReservedListener } from "./events/tickets-reserved-listener";

const main = async () => {
  if (!process.env.JWT_KEY) {
    throw new Error("JWT_KEY must be present");
  }

  if (!process.env.REDIS_HOST) {
    throw new Error("REDIS_HOST must be present");
  }

  if (
    !process.env.ORDERS_STRIPE_SECRET_KEY ||
    !process.env.ORDERS_STRIPE_WEBHOOK_SECRET
  ) {
    throw new Error("Stripe environment variables must be set");
  }
  if (
    !process.env.ORDERS_POSTGRES_USER ||
    !process.env.ORDERS_POSTGRES_PASSWORD ||
    !process.env.ORDERS_POSTGRES_DB
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

  // new TicketCreatedListener(natsWrapper.js).listen();
  new TicketsReservedListener(natsWrapper.js).listen();

  await db.execute(sql`SELECT 1`).catch((error) => {
    pl.fatal(error, "Failed to connect to Postgres");
    process.exit(-1);
  });
  pl.info("🚀 ~ connected to Postgres");

  // Listen for PostgreSQL notifications
  const notifClient = await pool.connect();
  await notifClient.query("LISTEN outbox_insert");
  pl.trace("🚀 ~ listening for outbox_insert notifications");

  // notifClient.on("notification", (msg) => {
  //   if (msg.channel === "outbox_insert") {
  //     outboxPublisher().catch((err) => {
  //       pl.error(err, "Failed to process outbox events");
  //     });
  //   }
  // });

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
    await cleanup().then(() => {
      pl.info("Cleanup completed, exiting");
      process.exit(0);
    });
  });

  process.on("SIGTERM", async () => {
    pl.info("SIGTERM received");
    await cleanup().then(() => {
      pl.info("Cleanup completed, exiting");
      process.exit(0);
    });
  });
};

main().catch((err) => {
  pl.fatal(err, "Failed to start the application");
  process.exit(1);
});
