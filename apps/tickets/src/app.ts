import { Hono } from "hono";
import { logger } from "hono/logger";
import { db } from "./db";
import { eventsTable } from "./db/schema";

const app = new Hono();

app.use(logger());

app.get("/api/tickets", (c) => {
  console.log("Hello ticket service !!");
  return c.json({ message: "Hello ticket serviceeee !!" });
});

// app.get("/api/tickets/test", async (c) => {
//   const result = await db
//     .insert(eventsTable)
//     .values({
//       name: "Concert A",
//       date: new Date(),
//     })
//     .returning();

//   return c.json({ message: "Event created", data: result });
// });

export { app };
