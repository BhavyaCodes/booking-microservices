import { Hono } from "hono";
import { logger } from "hono/logger";
import { extractCurrentUser, requireAdmin } from "@booking/common/middlewares";
import { HTTPException } from "hono/http-exception";
import { CurrentUser } from "@booking/common/interfaces";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./db";
import { eventsTable, seatCategoriesTable, ticketsTable } from "./db/schema";
import { count } from "drizzle-orm";

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
  .post(
    "/api/tickets/events/:eventId/seat-categories",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() })),
    zValidator(
      "json",
      z
        .object({
          startRow: z.number().int().min(1),
          endRow: z.number().int().min(1),
          price: z.number().int().min(1),
          seatsPerRow: z.number().int().min(1),
        })
        .refine((data) => data.endRow >= data.startRow, {
          path: ["endRow"],
          message: "endRow must be greater than or equal to startRow",
        }),
    ),
    async (c) => {
      const { eventId } = c.req.param();

      const event = await db.query.eventsTable.findFirst({
        where: (eventsTable, { eq }) => eq(eventsTable.id, eventId),
      });

      if (!event) {
        throw new HTTPException(404, {
          res: new Response(
            JSON.stringify({
              message: "Event not found",
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          ),
        });
      }

      if (!event.draft) {
        throw new HTTPException(400, {
          res: new Response(
            JSON.stringify({
              message: "Event is not in draft mode",
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          ),
        });
      }

      const { startRow, endRow, price, seatsPerRow } = c.req.valid("json");

      const newSeatCategory = await db.transaction(async (tx) => {
        // check for overlapping rows with existing seat categories

        const existingSeatCategoriesForEvent =
          await tx.query.seatCategoriesTable.findMany({
            where: (seatCategoriesTable, { eq }) =>
              eq(seatCategoriesTable.eventId, eventId),
          });

        const hasOverlap = existingSeatCategoriesForEvent.some((category) => {
          if (startRow >= category.startRow && startRow <= category.endRow) {
            return true;
          }

          if (endRow >= category.startRow && endRow <= category.endRow) {
            return true;
          }

          if (startRow <= category.startRow && endRow >= category.endRow) {
            return true;
          }
          return false;
        });

        if (hasOverlap) {
          throw new HTTPException(400, {
            res: new Response(
              JSON.stringify({
                message: "Seat category rows overlap with existing categories",
              }),
              {
                headers: { "Content-Type": "application/json" },
              },
            ),
          });
        }

        try {
          const newSeatCategory = await tx
            .insert(seatCategoriesTable)
            .values({
              eventId: eventId,
              startRow,
              endRow,
              price,
              seatsPerRow,
            })
            .returning();

          const newTickets: {
            seatCategoryId: string;
            row: number;
            seatNumber: number;
          }[] = [];

          for (let row = startRow; row <= endRow; row++) {
            for (let seat = 1; seat <= seatsPerRow; seat++) {
              newTickets.push({
                seatCategoryId: newSeatCategory[0].id,
                row: row,
                seatNumber: seat,
              });
            }
          }

          await tx.insert(ticketsTable).values(newTickets);

          return newSeatCategory[0];
        } catch (error) {
          // tx.rollback(); // Explicit rollback is not needed; Drizzle ORM handles it automatically
          console.error("Error creating seat category and tickets:", error);
          throw new HTTPException(500, {
            res: new Response(
              JSON.stringify({
                message: "Failed to create seat category and tickets",
              }),
              {
                headers: { "Content-Type": "application/json" },
              },
            ),
          });
        }
      });

      return c.json(newSeatCategory, 201);
    },
  )
  .get("/api/tickets/db-info", requireAdmin, async (c) => {
    const eventsCount = await db.select({ count: count() }).from(eventsTable);
    const seatCategoriesCount = await db
      .select({ count: count() })
      .from(seatCategoriesTable);
    const ticketsCount = await db.select({ count: count() }).from(ticketsTable);

    return c.json({
      eventsCount: eventsCount[0].count,
      seatCategoriesCount: seatCategoriesCount[0].count,
      ticketsCount: ticketsCount[0].count,
    });
  })
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
