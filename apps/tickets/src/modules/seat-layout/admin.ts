import { and, eq, gt, isNotNull, lt, ne, or } from "drizzle-orm";
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
} from "@booking/common";
import { db } from "../../db";
import {
  eventsTable,
  seatCategoriesTable,
  ticketsTable,
} from "../../db/schema";
import { pl } from "../../logger";
import { buildTicketGrid, rowsOverlap } from "./geometry";

export async function createSeatCategory({
  eventId,
  name,
  startRow,
  endRow,
  price,
  seatsPerRow,
}: {
  eventId: string;
  name: string;
  startRow: number;
  endRow: number;
  price: number;
  seatsPerRow: number;
}) {
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

  return await db.transaction(async (tx) => {
    const existingSeatCategoriesForEvent =
      await tx.query.seatCategoriesTable.findMany({
        where: (seatCategoriesTable, { eq }) =>
          eq(seatCategoriesTable.eventId, eventId),
      });

    const hasOverlap = existingSeatCategoriesForEvent.some((category) =>
      rowsOverlap(startRow, endRow, category),
    );

    if (hasOverlap) {
      throw new HTTPException(400, {
        res: new CustomErrorResponse({
          message: "Seat category rows overlap with existing seat categories",
        }),
      });
    }

    try {
      const newSeatCategory = await tx
        .insert(seatCategoriesTable)
        .values({
          name,
          eventId,
          startRow,
          endRow,
          price,
          seatsPerRow,
        })
        .returning();

      const newTickets = buildTicketGrid({
        seatCategoryId: newSeatCategory[0].id,
        eventId,
        startRow,
        endRow,
        seatsPerRow,
      });

      await tx.insert(ticketsTable).values(newTickets);

      return newSeatCategory[0];
    } catch (error) {
      pl.error(error, "Error creating seat category and tickets");
      throw new HTTPException(500, {
        res: new CustomErrorResponse({
          message: "Failed to create seat category and tickets",
        }),
      });
    }
  });
}

export async function updateSeatCategory({
  id,
  price,
  startRow,
  endRow,
  seatsPerRow,
  currentVersion,
}: {
  id: string;
  price?: number;
  startRow?: number;
  endRow?: number;
  seatsPerRow?: number;
  currentVersion: number;
}) {
  try {
    const result = await db.transaction(async (tx) => {
      const foundSeatCategoryArr = await tx
        .select()
        .from(seatCategoriesTable)
        .where(eq(seatCategoriesTable.id, id))
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

      if (foundSeatCategory.version !== currentVersion) {
        throw new HTTPException(409, {
          res: new CustomErrorResponse({
            code: ErrorCodes.INVALID_VERSION,
            message:
              "Seat category has been modified by another process. Please refresh and try again.",
          }),
        });
      }

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

      if (startRow || endRow) {
        const newStartRow = startRow ?? foundSeatCategory.startRow;
        const newEndRow = endRow ?? foundSeatCategory.endRow;

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

        const hasOverlap = existingSeatCategoriesForEvent.some((category) =>
          rowsOverlap(newStartRow, newEndRow, category),
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

      const updatedSeatCategory = await tx
        .update(seatCategoriesTable)
        .set({
          startRow: startRow ?? foundSeatCategory.startRow,
          endRow: endRow ?? foundSeatCategory.endRow,
          price: price ?? foundSeatCategory.price,
          seatsPerRow: seatsPerRow ?? foundSeatCategory.seatsPerRow,
          version: currentVersion + 1,
        })
        .where(eq(seatCategoriesTable.id, id))
        .returning();

      if (seatsPerRow || startRow || endRow) {
        const finalStartRow = startRow ?? foundSeatCategory.startRow;
        const finalEndRow = endRow ?? foundSeatCategory.endRow;
        const finalSeatsPerRow =
          seatsPerRow ?? foundSeatCategory.seatsPerRow;

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

        const ticketsToAdd = buildTicketGrid({
          seatCategoryId: foundSeatCategory.id,
          eventId: foundSeatCategory.eventId,
          startRow: finalStartRow,
          endRow: finalEndRow,
          seatsPerRow: finalSeatsPerRow,
        });

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

    return result[0];
  } catch (error) {
    pl.error(error, "Error updating seat category");
    throw error;
  }
}

export async function listSeatCategoriesForEvent(eventId: string) {
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

  return await db
    .select()
    .from(seatCategoriesTable)
    .where(eq(seatCategoriesTable.eventId, eventId));
}

export async function listTicketsForSeatCategory(seatCategoryId: string) {
  return await db.query.ticketsTable.findMany({
    where: (ticketsTable, { eq }) =>
      eq(ticketsTable.seatCategoryId, seatCategoryId),
  });
}
