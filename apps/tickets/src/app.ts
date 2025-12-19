import { Hono } from "hono";
import { logger } from "hono/logger";
import { extractCurrentUser, requireAdmin } from "@booking/common/middlewares";
import { HTTPException } from "hono/http-exception";
import { CurrentUser } from "@booking/common/interfaces";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./db";
import { eventsTable } from "./db/schema";

const app = new Hono<{
  Variables: {
    currentUser: CurrentUser;
  };
}>()
  .use(logger())
  .use(extractCurrentUser)
  .get("/api/tickets", (c) => {
    return c.json({ message: "Hello ticket service !!" });
  })
  .post(
    "/api/tickets/events",
    requireAdmin,
    zValidator(
      "json",
      z.object({
        title: z.string().min(1).max(255),
        desc: z.string().min(1).max(1000),
        date: z.coerce.date().refine((date) => date >= new Date(), {
          message: "Date must not be in the past",
        }),
        imageUrl: z.url().max(500).optional(),
      }),
    ),
    async (c) => {
      const { title, desc, date, imageUrl } = c.req.valid("json");

      const newEvent = await db
        .insert(eventsTable)
        .values({
          title,
          desc,
          date,
          imageUrl,
        })
        .returning();

      return c.json(newEvent[0], 201);
    },
  )
  .onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    } else {
      console.error("Unhandled error:", error);
      throw new HTTPException(500, {
        res: new Response(
          JSON.stringify({
            message: "Internal Server Error",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        ),
      });
    }
  });
export { app };
