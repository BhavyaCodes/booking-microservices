import { desc } from "drizzle-orm";
import { CustomErrorResponse, HTTPException } from "@booking/common";
import { db } from "../../db";
import { eventsTable } from "../../db/schema";

export async function listPublishedEvents() {
  return await db.query.eventsTable.findMany({
    where: (eventsTable, { eq }) => eq(eventsTable.draft, false),
    columns: {
      date: true,
      title: true,
      imageUrl: true,
      id: true,
      desc: true,
    },
    orderBy: [desc(eventsTable.date)],
  });
}

export async function getPublishedEvent(eventId: string) {
  const event = await db.query.eventsTable.findFirst({
    where: (eventsTable, { eq, and }) =>
      and(eq(eventsTable.id, eventId), eq(eventsTable.draft, false)),
  });

  if (!event) {
    throw new HTTPException(404, {
      res: new CustomErrorResponse({
        message: "Event not found",
      }),
    });
  }

  return {
    id: event.id,
    title: event.title,
    desc: event.desc,
    date: event.date,
    imageUrl: event.imageUrl,
  };
}
