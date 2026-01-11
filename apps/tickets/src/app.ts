import { Hono } from "hono";

import { extractCurrentUser, requireAdmin } from "@booking/common/middlewares";
import { CurrentUser } from "@booking/common/interfaces";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./db";
import { eventsTable, seatCategoriesTable, ticketsTable } from "./db/schema";
import { and, count, eq } from "drizzle-orm";
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
  Subjects,
  TicketCreatedEvent,
  zodValidationHook,
} from "@booking/common";
import { addEventToOutBox } from "./outbox";
import { logger } from "hono/logger";
import { pl } from "./logger";

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
      zodValidationHook,
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
  .patch(
    "/api/tickets/events/:eventId",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    zValidator(
      "json",
      z.object({
        title: z.string().min(1).max(255).optional(),
        desc: z.string().min(1).max(1000).optional(),
        date: z.coerce
          .date()
          .refine((date) => date >= new Date(), {
            message: "Date must not be in the past",
          })
          .optional(),
        imageUrl: z.url().max(500).optional(),
        currentVersion: z.number().int().min(0),
      }),
      zodValidationHook,
    ),
    async (c) => {
      try {
        await db.transaction(async (tx) => {
          const foundEventArr = await tx
            .select()
            .from(eventsTable)
            .where(eq(eventsTable.id, c.req.param("eventId")))
            .for("update", { skipLocked: true })
            .limit(1);

          const foundEvent = foundEventArr[0];

          if (!foundEvent) {
            throw new HTTPException(404, {
              res: new CustomErrorResponse({
                message: "Event not found",
              }),
            });
          }

          if (foundEvent.version !== c.req.valid("json").currentVersion) {
            throw new HTTPException(409, {
              res: new CustomErrorResponse({
                code: ErrorCodes.INVALID_VERSION,
                message:
                  "Event has been modified by another process. Please refresh and try again.",
              }),
            });
          }

          if (foundEvent.draft === false) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                message: "Cannot edit a published event",
              }),
            });
          }

          const { title, desc, date, imageUrl, currentVersion } =
            c.req.valid("json");

          const updatedEvent = await tx
            .update(eventsTable)
            .set({
              title: title ?? foundEvent.title,
              desc: desc ?? foundEvent.desc,
              date: date ?? foundEvent.date,
              imageUrl: imageUrl ?? foundEvent.imageUrl,
              version: currentVersion + 1,
            })
            .where(
              and(
                eq(eventsTable.id, c.req.param("eventId")),
                eq(eventsTable.version, currentVersion),
              ),
            )
            .returning();

          return updatedEvent[0];
        });
      } catch (error) {
        pl.error(error, "Error updating event");
        throw new HTTPException(500, {
          res: new CustomErrorResponse({
            message: "Failed to update event",
          }),
        });
      }

      // const foundEvent = await db.query.eventsTable.findFirst({
      //   where: (eventsTable, { eq }) =>
      //     eq(eventsTable.id, c.req.param("eventId")),
      // });

      // if (!foundEvent) {
      //   throw new HTTPException(404, {
      //     res: new CustomErrorResponse({
      //       message: "Event not found",
      //     }),
      //   });
      // }

      // if (foundEvent.version !== c.req.valid("json").currentVersion) {
      //   throw new HTTPException(409, {
      //     res: new CustomErrorResponse({
      //       code: ErrorCodes.INVALID_VERSION,
      //       message:
      //         "Event has been modified by another process. Please refresh and try again.",
      //     }),
      //   });
      // }

      // if (foundEvent.draft === false) {
      //   throw new HTTPException(400, {
      //     res: new CustomErrorResponse({
      //       message: "Cannot edit a published event",
      //     }),
      //   });
      // }

      // const { title, desc, date, imageUrl, currentVersion } =
      //   c.req.valid("json");
    },
  )
  .post(
    "/api/tickets/events/:eventId/seat-categories",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
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
      zodValidationHook,
    ),
    async (c) => {
      const { eventId } = c.req.param();
      const event = await db.query.eventsTable.findFirst({
        where: (eventsTable, { eq }) => eq(eventsTable.id, eventId),
      });

      if (!event) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "Event not found",
          }),
        });
      }

      if (!event.draft) {
        throw new HTTPException(400, {
          res: new CustomErrorResponse({
            message: "Event is not in draft mode",
          }),
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
            res: new CustomErrorResponse({
              message:
                "Seat category rows overlap with existing seat categories",
            }),
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

          const tickets = await tx
            .insert(ticketsTable)
            .values(newTickets)
            .returning();

          const eventData: TicketCreatedEvent["data"] = tickets.map(
            (ticket) => ({
              id: ticket.id,
              price: price,
              seatCategoryId: ticket.seatCategoryId,
              date: event.date.toISOString(),
            }),
          );

          await addEventToOutBox(tx, {
            subject: Subjects.TicketsCreated,
            data: eventData,
          });

          return newSeatCategory[0];
        } catch (error) {
          // tx.rollback(); // Explicit rollback is not needed; Drizzle ORM handles it automatically
          pl.error(error, "Error creating seat category and tickets");
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to create seat category and tickets",
            }),
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
      pl.error(error, "Unhandled error occurred");
      throw new HTTPException(500, {
        res: new CustomErrorResponse({
          message: "Internal Server Error",
        }),
      });
    }
  });
export { app };
