import { count, eq } from "drizzle-orm";
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
} from "@booking/common";
import { db } from "../../db";
import { eventsTable, seatCategoriesTable } from "../../db/schema";
import { pl } from "../../logger";

export async function createEvent({
  title,
  desc,
  date,
  imageUrl,
}: {
  title: string;
  desc: string;
  date: Date;
  imageUrl?: string;
}) {
  const newEvent = await db
    .insert(eventsTable)
    .values({
      title,
      desc,
      date,
      imageUrl,
    })
    .returning();

  return newEvent[0];
}

export async function updateDraftEvent({
  eventId,
  title,
  desc,
  date,
  imageUrl,
  currentVersion,
}: {
  eventId: string;
  title?: string;
  desc?: string;
  date?: Date;
  imageUrl?: string;
  currentVersion: number;
}) {
  try {
    return await db.transaction(async (tx) => {
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
            message: "Cannot edit a published event",
          }),
        });
      }

      const updatedEvent = await tx
        .update(eventsTable)
        .set({
          title: title ?? foundEvent.title,
          desc: desc ?? foundEvent.desc,
          date: date ?? foundEvent.date,
          imageUrl: imageUrl ?? foundEvent.imageUrl,
          version: currentVersion + 1,
        })
        .where(eq(eventsTable.id, eventId))
        .returning();

      return updatedEvent[0];
    });
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
}

export async function publishEvent({
  eventId,
  currentVersion,
}: {
  eventId: string;
  currentVersion: number;
}) {
  return await db.transaction(async (tx) => {
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

    const seatCategoryCount = await tx
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
}
