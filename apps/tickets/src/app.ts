import { Hono } from "hono";

import {
  extractCurrentUser,
  requireAdmin,
  requireAuth,
} from "@booking/common/middlewares";
import { CurrentUser } from "@booking/common/interfaces";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./db";
import { eventsTable, seatCategoriesTable, ticketsTable } from "./db/schema";
import { and, count, eq, ne, or, lt, gt, isNotNull } from "drizzle-orm";
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
  // events routes
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
        const result = await db.transaction(async (tx) => {
          const foundEventArr = await tx
            .select()
            .from(eventsTable)
            .where(eq(eventsTable.id, c.req.param("eventId")))
            .for("update")
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
            .where(eq(eventsTable.id, c.req.param("eventId")))
            .returning();

          return updatedEvent[0];
        });

        return c.json(result, 200);
      } catch (error) {
        pl.error(error, "Error updating event");

        if (error instanceof HTTPException) {
          throw error;
        } else {
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Failed to update event",
            }),
          });
        }
      }
    },
  )
  .post(
    "/api/tickets/events/:eventId/publish",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    zValidator(
      "json",
      z.object({
        currentVersion: z.number().int().min(0),
      }),
      zodValidationHook,
    ),
    async (c) => {
      const eventId = c.req.param("eventId");
      const currentVersion = c.req.valid("json").currentVersion;
      // it should have at least one seat category to be published
      const seatCategoryCount = await db
        .select({ count: count() })
        .from(seatCategoriesTable)
        .where(eq(seatCategoriesTable.eventId, eventId));

      if (seatCategoryCount[0].count === 0) {
        throw new HTTPException(400, {
          res: new CustomErrorResponse({
            message: "Cannot publish event without at least one seat category",
          }),
        });
      }

      const result = await db.transaction(async (tx) => {
        const foundEventArr = await tx
          .select()
          .from(eventsTable)
          .where(eq(eventsTable.id, eventId))
          .for("update")
          .limit(1);

        const foundEvent = foundEventArr[0];

        if (!foundEvent) {
          throw new HTTPException(404, {
            res: new CustomErrorResponse({
              message: "Event not found",
            }),
          });
        }

        if (foundEvent.version !== currentVersion) {
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
              message: "Event is already published",
            }),
          });
        }

        const updatedEvent = await tx
          .update(eventsTable)
          .set({
            draft: false,
            version: currentVersion + 1,
          })
          .where(eq(eventsTable.id, eventId))
          .returning();

        if (updatedEvent.length === 0) {
          throw new HTTPException(500, {
            res: new CustomErrorResponse({
              message: "Internal error publishing event",
            }),
          });
        }

        return updatedEvent[0];
      });

      return c.json(result, 200);
    },
  )
  // seat categories routes
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
            eventId: string;
          }[] = [];

          for (let row = startRow; row <= endRow; row++) {
            for (let seat = 1; seat <= seatsPerRow; seat++) {
              newTickets.push({
                seatCategoryId: newSeatCategory[0].id,
                row: row,
                seatNumber: seat,
                eventId,
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
  .patch(
    "/api/tickets/seat-categories/:id",
    requireAdmin,
    zValidator("param", z.object({ id: z.uuid() }), zodValidationHook),
    zValidator(
      "json",
      z
        .object({
          price: z.number().int().min(1).optional(),
          startRow: z.number().int().min(1).optional(),
          endRow: z.number().int().min(1).optional(),
          seatsPerRow: z.number().int().min(1).optional(),
          currentVersion: z.number().int().min(0),
        })
        .refine(
          (data) => {
            if (data.startRow !== undefined && data.endRow !== undefined) {
              return data.endRow >= data.startRow;
            }
            return true;
          },
          { error: "End row must be greater than or equal to start row" },
        ),
      zodValidationHook,
    ),
    async (c) => {
      try {
        // check if seat category exists and is linked to draft event
        const result = await db.transaction(async (tx) => {
          const foundSeatCategoryArr = await tx
            .select()
            .from(seatCategoriesTable)
            .where(eq(seatCategoriesTable.id, c.req.param("id")))
            .for("update")
            .limit(1);

          const foundSeatCategory = foundSeatCategoryArr[0];

          if (!foundSeatCategory) {
            throw new HTTPException(404, {
              res: new CustomErrorResponse({
                message: "Seat category not found",
              }),
            });
          }

          if (
            foundSeatCategory.version !== c.req.valid("json").currentVersion
          ) {
            throw new HTTPException(409, {
              res: new CustomErrorResponse({
                code: ErrorCodes.INVALID_VERSION,
                message:
                  "Seat category has been modified by another process. Please refresh and try again.",
              }),
            });
          }

          // throw error if any tickets have been booked under this seat category

          const checkIfAnyTicketsBookedArr = await tx
            .select()
            .from(ticketsTable)
            .where(
              and(
                eq(ticketsTable.seatCategoryId, foundSeatCategory.id),
                isNotNull(ticketsTable.userId),
              ),
            )
            .limit(1);

          if (checkIfAnyTicketsBookedArr.length > 0) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                message:
                  "Cannot modify seat category as some tickets have already been booked",
              }),
            });
          }

          const linkedEventArr = await tx
            .select()
            .from(eventsTable)
            .where(eq(eventsTable.id, foundSeatCategory.eventId))
            .limit(1);

          const linkedEvent = linkedEventArr[0];

          if (!linkedEvent || linkedEvent.draft === false) {
            throw new HTTPException(400, {
              res: new CustomErrorResponse({
                message:
                  "Cannot edit seat category linked to a published or non-existing event",
              }),
            });
          }

          const { startRow, endRow, price, seatsPerRow, currentVersion } =
            c.req.valid("json");

          // if startRow or endRow is being updated, ensure no overlap with other seat categories

          if (startRow || endRow) {
            const newStartRow = startRow ?? foundSeatCategory.startRow;
            const newEndRow = endRow ?? foundSeatCategory.endRow;

            // Validate endRow >= startRow for partial updates
            if (newEndRow < newStartRow) {
              throw new HTTPException(400, {
                res: new CustomErrorResponse({
                  message: "endRow must be greater than or equal to startRow",
                }),
              });
            }

            const existingSeatCategoriesForEvent = await tx
              .select()
              .from(seatCategoriesTable)
              .where(
                and(
                  eq(seatCategoriesTable.eventId, foundSeatCategory.eventId),
                  ne(seatCategoriesTable.id, foundSeatCategory.id),
                ),
              )
              .for("update");

            const hasOverlap = existingSeatCategoriesForEvent.some(
              (category) => {
                if (
                  newStartRow >= category.startRow &&
                  newStartRow <= category.endRow
                ) {
                  return true;
                }

                if (
                  newEndRow >= category.startRow &&
                  newEndRow <= category.endRow
                ) {
                  return true;
                }

                if (
                  newStartRow <= category.startRow &&
                  newEndRow >= category.endRow
                ) {
                  return true;
                }
                return false;
              },
            );

            if (hasOverlap) {
              throw new HTTPException(400, {
                res: new CustomErrorResponse({
                  message:
                    "Seat category rows overlap with existing seat categories",
                }),
              });
            }
          }

          // update the seat category

          const updatedSeatCategory = await tx
            .update(seatCategoriesTable)
            .set({
              startRow: startRow ?? foundSeatCategory.startRow,
              endRow: endRow ?? foundSeatCategory.endRow,
              price: price ?? foundSeatCategory.price,
              seatsPerRow: seatsPerRow ?? foundSeatCategory.seatsPerRow,
              version: currentVersion + 1,
            })
            .where(eq(seatCategoriesTable.id, c.req.param("id")))
            .returning();

          // update the tickets associated with this seat category if seatsPerRow, startRow or endRow changed

          if (seatsPerRow || startRow || endRow) {
            const finalStartRow = startRow ?? foundSeatCategory.startRow;
            const finalEndRow = endRow ?? foundSeatCategory.endRow;
            const finalSeatsPerRow =
              seatsPerRow ?? foundSeatCategory.seatsPerRow;

            // delete tickets that are out of the new range
            await tx
              .delete(ticketsTable)
              .where(
                and(
                  eq(ticketsTable.seatCategoryId, foundSeatCategory.id),
                  or(
                    lt(ticketsTable.row, finalStartRow),
                    gt(ticketsTable.row, finalEndRow),
                    gt(ticketsTable.seatNumber, finalSeatsPerRow),
                  ),
                ),
              );

            // add tickets for new seats in the expanded range

            const ticketsToAdd: {
              seatCategoryId: string;
              row: number;
              seatNumber: number;
              eventId: string;
            }[] = [];

            // upsert tickets for rows
            for (let row = finalStartRow; row <= finalEndRow; row++) {
              for (let seat = 1; seat <= finalSeatsPerRow; seat++) {
                ticketsToAdd.push({
                  seatCategoryId: foundSeatCategory.id,
                  row: row,
                  seatNumber: seat,
                  eventId: foundSeatCategory.eventId,
                });
              }
            }

            await tx
              .insert(ticketsTable)
              .values(ticketsToAdd)
              .onConflictDoNothing({
                target: [
                  ticketsTable.seatCategoryId,
                  ticketsTable.row,
                  ticketsTable.seatNumber,
                ],
              });
          }

          return updatedSeatCategory;
        });

        return c.json(result[0], 200);
      } catch (error) {
        pl.error(error, "Error updating seat category");
        throw error;
      }
    },
  )
  .get(
    "/api/tickets/admin/events/:eventId/seat-categories",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    async (c) => {
      const { eventId } = c.req.param();

      const event = await db.query.eventsTable.findFirst({
        where: (eventsTable, { eq }) => eq(eventsTable.id, eventId),
        columns: {
          id: true,
        },
      });

      if (!event) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "Event not found",
          }),
        });
      }

      const seatCategories = await db
        .select()
        .from(seatCategoriesTable)
        .where(eq(seatCategoriesTable.eventId, eventId));

      // pl.debug(result, "Seat categories with event join result");
      return c.json(seatCategories, 200);
    },
  )
  .get(
    "/api/tickets/events/:eventId/seat-categories",
    requireAuth,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    async (c) => {
      const { eventId } = c.req.param();
      const eventsSubquery = db
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.draft, false))
        .as("event");

      const result = await db
        .select()
        .from(seatCategoriesTable)
        .where(eq(seatCategoriesTable.eventId, eventId))
        .innerJoinLateral(
          eventsSubquery,
          eq(seatCategoriesTable.eventId, eventsSubquery.id),
        );

      pl.debug(result, "Seat categories with event join result");

      // Check if event exists and is published by verifying if we got any results
      // with valid event data, or if no results, event doesn't exist or is in draft
      if (result.length === 0) {
        // Check if event exists at all
        const event = await db.query.eventsTable.findFirst({
          where: eq(eventsTable.id, eventId),
        });

        if (!event) {
          throw new HTTPException(404, {
            res: new CustomErrorResponse({
              message: "Event not found",
            }),
          });
        }

        // Event exists but is in draft mode
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "Seat category not found",
          }),
        });
      }

      const seatCategories = result.map((r) => r.seat_categories);

      return c.json(seatCategories, 200);
    },
  )
  // tickets routes
  .get(
    "/api/tickets/admin/seat-categories/:seatCategoryId/tickets",
    requireAdmin,
    zValidator(
      "param",
      z.object({ seatCategoryId: z.uuid() }),
      zodValidationHook,
    ),
    async (c) => {
      const { seatCategoryId } = c.req.param();

      const tickets = await db.query.ticketsTable.findMany({
        where: (ticketsTable, { eq }) =>
          eq(ticketsTable.seatCategoryId, seatCategoryId),
      });

      return c.json(tickets, 200);
    },
  )
  .get(
    "/api/tickets/seat-categories/:seatCategoryId/tickets",
    requireAuth,
    zValidator(
      "param",
      z.object({ seatCategoryId: z.uuid() }),
      zodValidationHook,
    ),
    async (c) => {
      const { seatCategoryId } = c.req.param();

      // normal user - only return tickets for published events

      // FIXME: might be better to fetch event first to check if published, then fetch tickets

      const tickets = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.seatCategoryId, seatCategoryId))
        .innerJoin(
          seatCategoriesTable,
          eq(ticketsTable.seatCategoryId, seatCategoriesTable.id),
        )
        .innerJoin(
          eventsTable,
          eq(seatCategoriesTable.eventId, eventsTable.id),
        );

      if (tickets.length === 0) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "No tickets found for the given seat category",
          }),
        });
      }

      if (tickets[0].events.draft) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "Event not found",
          }),
        });
      }

      const response = tickets.map((t) => {
        return {
          id: t.tickets.id,
          seatCategoryId: t.tickets.seatCategoryId,
          row: t.tickets.row,
          seatNumber: t.tickets.seatNumber,
          userId: Boolean(t.tickets.userId),
        };
      });

      return c.json(response, 200);
    },
  )
  // admin route to get counts of events, seat categories and tickets
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
