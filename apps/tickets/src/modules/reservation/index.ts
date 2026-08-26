import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  CustomErrorResponse,
  HTTPException,
  Subjects,
} from "@booking/common";
import { db } from "../../db";
import {
  eventsTable,
  seatCategoriesTable,
  ticketsTable,
} from "../../db/schema";
import { addEventToOutBox } from "../../outbox";
import { pl } from "../../logger";

const EXPIRY_TIME_MINUTES = 15;

export async function reserveTickets({
  seatCategoryId,
  ticketIds,
  userId,
}: {
  seatCategoryId: string;
  ticketIds: string[];
  userId: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const lockedTickets = await tx
        .select()
        .from(ticketsTable)
        .where(
          and(
            eq(ticketsTable.seatCategoryId, seatCategoryId),
            inArray(ticketsTable.id, ticketIds),
            isNull(ticketsTable.userId),
          ),
        )
        .for("update");

      if (lockedTickets.length !== ticketIds.length) {
        throw new HTTPException(400, {
          res: new CustomErrorResponse({
            message:
              "Some tickets are already reserved or do not exist in the specified seat category",
          }),
        });
      }

      const seatCategoryWithEvent = await tx
        .select()
        .from(seatCategoriesTable)
        .where(eq(seatCategoriesTable.id, seatCategoryId))
        .innerJoin(
          eventsTable,
          eq(seatCategoriesTable.eventId, eventsTable.id),
        )
        .limit(1)
        .for("update");

      if (seatCategoryWithEvent.length === 0) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "Seat category not found",
          }),
        });
      }

      const linkedEvent = seatCategoryWithEvent[0].events;

      if (linkedEvent.draft) {
        throw new HTTPException(400, {
          res: new CustomErrorResponse({
            message: "Event is not published",
          }),
        });
      }

      if (linkedEvent.date < new Date()) {
        throw new HTTPException(400, {
          res: new CustomErrorResponse({
            message: "Cannot reserve tickets for past events",
          }),
        });
      }

      const ticketsToReserve = await tx
        .update(ticketsTable)
        .set({
          userId,
        })
        .where(
          and(
            eq(ticketsTable.seatCategoryId, seatCategoryId),
            inArray(ticketsTable.id, ticketIds),
            isNull(ticketsTable.userId),
          ),
        )
        .returning();

      if (ticketsToReserve.length !== lockedTickets.length) {
        pl.error("Failed to reserve tickets");
        throw new HTTPException(500, {
          res: new CustomErrorResponse({
            message: "Failed to reserve tickets",
          }),
        });
      }

      await addEventToOutBox(tx, {
        subject: Subjects.TicketsReserved,
        data: {
          ticketIds,
          userId,
          amount:
            ticketsToReserve.length *
            seatCategoryWithEvent[0].seat_categories.price,
          expiresAt: new Date(
            Date.now() + EXPIRY_TIME_MINUTES * 60 * 1000,
          ).toISOString(),
        },
      });

      return ticketsToReserve;
    });
  } catch (error) {
    if (!(error instanceof HTTPException)) {
      pl.error({ error }, "Error reserving tickets");
    }
    throw error;
  }
}
