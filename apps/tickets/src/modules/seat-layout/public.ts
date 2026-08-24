import { eq } from "drizzle-orm";
import { CustomErrorResponse, HTTPException } from "@booking/common";
import { db } from "../../db";
import {
  eventsTable,
  seatCategoriesTable,
  ticketsTable,
} from "../../db/schema";
import { pl } from "../../logger";

export async function listPublishedSeatCategories(eventId: string) {
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

  pl.debug({ result }, "Seat categories with event join result");

  if (result.length === 0) {
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

    throw new HTTPException(404, {
      res: new CustomErrorResponse({
        message: "Seat category not found",
      }),
    });
  }

  return result.map((r) => r.seat_categories);
}

export async function listPublishedTicketsForSeatCategory(
  seatCategoryId: string,
) {
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

  return tickets.map((t) => ({
    id: t.tickets.id,
    seatCategoryId: t.tickets.seatCategoryId,
    row: t.tickets.row,
    seatNumber: t.tickets.seatNumber,
    userId: Boolean(t.tickets.userId),
    eventId: t.tickets.eventId,
    sold: t.tickets.sold,
  }));
}

export async function listPublishedEventTickets(eventId: string) {
  const event = await db.query.eventsTable.findFirst({
    where: (eventsTable, { eq }) => eq(eventsTable.id, eventId),
  });

  if (!event || event?.draft) {
    throw new HTTPException(404, {
      res: new CustomErrorResponse({
        message: "Event not found",
      }),
    });
  }

  if (event.date < new Date()) {
    throw new HTTPException(400, {
      res: new CustomErrorResponse({
        message: "Cannot get tickets for past events",
      }),
    });
  }

  return await db.query.seatCategoriesTable.findMany({
    where: (seatCategoriesTable, { eq }) =>
      eq(seatCategoriesTable.eventId, eventId),
    with: {
      tickets: {
        orderBy: (ticketsTable, { asc }) => [
          asc(ticketsTable.row),
          asc(ticketsTable.seatNumber),
        ],
      },
    },
    orderBy: (seatCategoriesTable, { asc }) => [
      asc(seatCategoriesTable.startRow),
    ],
  });
}
