import { Hono } from "hono";

import {
  extractCurrentUser,
  requireAdmin,
  requireAuth,
} from "@booking/common/middlewares";
import type { CurrentUser } from "@booking/common/interfaces";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./db";
import { eventsTable, seatCategoriesTable, ticketsTable } from "./db/schema";
import { count } from "drizzle-orm";
import {
  CustomErrorResponse,
  HTTPException,
  zodValidationHook,
} from "@booking/common";
import { logger } from "hono/logger";
import { pl } from "./logger";
import { reserveTickets } from "./modules/reservation";
import {
  createEvent,
  updateDraftEvent,
  publishEvent,
  listPublishedEvents,
  getPublishedEvent,
} from "./modules/event-catalog";
import {
  createSeatCategory,
  updateSeatCategory,
  listSeatCategoriesForEvent,
  listTicketsForSeatCategory,
  listPublishedSeatCategories,
  listPublishedTicketsForSeatCategory,
  listPublishedEventTickets,
} from "./modules/seat-layout";

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
    "/api/tickets/admin/events",
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
      const newEvent = await createEvent({ title, desc, date, imageUrl });
      return c.json(newEvent, 201);
    },
  )
  .patch(
    "/api/tickets/admin/events/:eventId",
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
      const { eventId } = c.req.param();
      const { title, desc, date, imageUrl, currentVersion } =
        c.req.valid("json");
      const result = await updateDraftEvent({
        eventId,
        title,
        desc,
        date,
        imageUrl,
        currentVersion,
      });
      return c.json(result, 200);
    },
  )
  .post(
    "/api/tickets/admin/events/:eventId/publish",
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
      const result = await publishEvent({ eventId, currentVersion });
      return c.json(result, 200);
    },
  )
  // TODO: add pagination to this endpoint,
  // add sorting by date or title
  // add filtering by date range
  // remove unwanted fields from response
  .get("/api/tickets/events", async (c) => {
    const events = await listPublishedEvents();
    return c.json(events, 200);
  })
  .get(
    "/api/tickets/events/:eventId",
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    async (c) => {
      const { eventId } = c.req.param();
      const event = await getPublishedEvent(eventId);
      return c.json(event, 200);
    },
  )
  // seat categories routes
  .post(
    "/api/tickets/admin/events/:eventId/seat-categories",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    zValidator(
      "json",
      z
        .object({
          name: z.preprocess(
            (val: unknown) =>
              typeof val === "string" ? val.trim().toLowerCase() : val,
            z.string().min(1).max(100),
          ),
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
      const { name, startRow, endRow, price, seatsPerRow } =
        c.req.valid("json");
      const newSeatCategory = await createSeatCategory({
        eventId,
        name,
        startRow,
        endRow,
        price,
        seatsPerRow,
      });
      return c.json(newSeatCategory, 201);
    },
  )
  .patch(
    "/api/tickets/admin/seat-categories/:id",
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
      const { id } = c.req.param();
      const { price, startRow, endRow, seatsPerRow, currentVersion } =
        c.req.valid("json");
      const result = await updateSeatCategory({
        id,
        price,
        startRow,
        endRow,
        seatsPerRow,
        currentVersion,
      });
      return c.json(result, 200);
    },
  )
  .get(
    "/api/tickets/admin/events/:eventId/seat-categories",
    requireAdmin,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    async (c) => {
      const { eventId } = c.req.param();
      const seatCategories = await listSeatCategoriesForEvent(eventId);
      return c.json(seatCategories, 200);
    },
  )
  .get(
    "/api/tickets/events/:eventId/seat-categories",
    requireAuth,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    async (c) => {
      const { eventId } = c.req.param();
      const seatCategories = await listPublishedSeatCategories(eventId);
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
      const tickets = await listTicketsForSeatCategory(seatCategoryId);
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
      const response =
        await listPublishedTicketsForSeatCategory(seatCategoryId);
      return c.json(response, 200);
    },
  )
  .get(
    "/api/tickets/events/:eventId/tickets",
    requireAuth,
    zValidator("param", z.object({ eventId: z.uuid() }), zodValidationHook),
    async (c) => {
      const { eventId } = c.req.param();
      const seatCategoriesWithTickets =
        await listPublishedEventTickets(eventId);
      return c.json(seatCategoriesWithTickets, 200);
    },
  )
  .post(
    "/api/tickets/seat-categories/:seatCategoryId/tickets/reserve",
    requireAuth,
    zValidator(
      "param",
      z.object({ seatCategoryId: z.uuid() }),
      zodValidationHook,
    ),
    zValidator(
      "json",
      z.object({
        ticketIds: z.array(z.uuid()).min(1).max(10),
      }),
      zodValidationHook,
    ),
    async (c) => {
      const { seatCategoryId } = c.req.param();
      const { ticketIds } = c.req.valid("json");
      const userId = c.get("currentUser").id;

      const reservedTickets = await reserveTickets({
        seatCategoryId,
        ticketIds,
        userId,
      });

      return c.json(reservedTickets, 200);
    },
  )
  // admin route to get counts of events, seat categories and tickets
  .get("/api/tickets/admin/db-info", requireAdmin, async (c) => {
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
  .query(
    "/api/tickets/order-info-by-ticket-ids",
    requireAuth,
    zValidator(
      "json",
      z.object({
        ticketIds: z.array(z.uuid()),
        sold: z.boolean().optional(),
      }),
      zodValidationHook,
    ),
    async (c) => {
      const { ticketIds, sold } = c.req.valid("json");

      const tickets = await db.query.ticketsTable.findMany({
        columns: {
          row: true,
          seatNumber: true,
        },
        where: (ticketsTable, { inArray, and, eq }) =>
          and(
            inArray(ticketsTable.id, ticketIds),
            eq(ticketsTable.userId, c.get("currentUser").id),
            sold === undefined ? undefined : eq(ticketsTable.sold, sold),
          ),
        with: {
          seatCategory: {
            columns: {
              name: true,
            },
          },
          event: {
            columns: {
              title: true,
              date: true,
              imageUrl: true,
            },
          },
        },
      });

      if (tickets.length === 0) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "Order info not found",
          }),
        });
      }

      return c.json(
        {
          event: tickets[0].event,
          seatCategory: tickets[0].seatCategory,
          tickets: tickets.map(({ row, seatNumber }) => ({
            row,
            seatNumber,
          })),
        },
        200,
      );
    },
  )
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
