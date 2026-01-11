import { testClient } from "hono/testing";
import { app as ticketsApp } from "../app";
import { describe, it, expect, vi } from "vitest";
import { UserRoles } from "@booking/common/interfaces";
import { db } from "../db";
import { eventsTable } from "../db/schema";
import * as outbox from "../outbox";
import { Subjects } from "@booking/common";
import { v7 as uuidv7 } from "uuid";
const client = testClient(ticketsApp);

describe("check environment NODE_ENV", () => {
  it("should be test", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});

describe("test if admin only route protection is working", () => {
  it("should throw 401 when not signed in", async () => {
    const response = await client.api.tickets.events.$post({
      json: {
        date: new Date(),
        desc: "Some event description",
        title: "Some event title",
        imageUrl: "https://example.com/image.jpg",
      },
    });

    expect(response.status).toBe(401);
  });

  it("should throw 403 when signed in as non-admin user", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.USER });

    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(),
          desc: "Some event description",
          title: "Some event title",
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(403);
  });

  it("should allow access when signed in as admin user", async () => {
    const title = "test event title";
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),
          desc: "Some event description",
          title: title,
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    console.log(await response.json());

    expect(response.status).toBe(201);

    const insertedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.title, title),
    });

    expect(insertedEvent).toBeDefined();
  });
});

describe("test event creation", () => {
  it("should create event in the database", async () => {
    const title = "test event title";
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),

          desc: "Some event description",
          title: title,
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    const count = await db.$count(eventsTable);
    expect(count).toBe(1);
    const insertedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.title, title),
    });

    expect(insertedEvent).toBeDefined();
  });

  it("should throw 400 when invalid date is provided", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date("invalid-date"),
          desc: "Some event description",
          title: "Some event title",
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(400);
  });

  it("should throw 400 when date is in the past", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() - 3600 * 1000),
          desc: "Some event description",
          title: "Some event title",
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(400);
  });

  it("should be able to store multiple events in the database", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const titles = ["event 1", "event 2", "event 3"];

    for (const title of titles) {
      await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),

            desc: "Some event description",
            title: title,
            imageUrl: "https://example.com/image.jpg",
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );
    }

    const count = await db.$count(eventsTable);
    expect(count).toBe(3);

    for (const title of titles) {
      const insertedEvent = await db.query.eventsTable.findFirst({
        where: (eventsTable, { eq }) => eq(eventsTable.title, title),
      });
      expect(insertedEvent).toBeDefined();
    }
  });

  it("event should have draft set to true by default", async () => {
    const title = "draft test event";
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),

          desc: "Some event description",
          title: title,
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    const insertedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.title, title),
    });

    expect(insertedEvent).toBeDefined();
    expect(insertedEvent!.draft).toBe(true);
  });
});

describe("test event update", () => {
  it("should update event in the database", async () => {
    const title = "test event title";
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),
          desc: "Some event description",
          title: title,
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(201);

    const createdEvent = await response.json();

    const updatedDate = new Date(new Date().getTime() + 7200 * 1000);
    const updatedDesc = "Updated event description";
    const updatedTitle = "updated event title";
    const updatedImageUrl = "https://example.com/updated-image.jpg";

    const updateResponse = await client.api.tickets.events[":eventId"].$patch(
      {
        json: {
          date: updatedDate,
          desc: updatedDesc,
          title: updatedTitle,
          imageUrl: updatedImageUrl,
          currentVersion: createdEvent.version,
        },
        param: {
          eventId: createdEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(updateResponse.status).toBe(200);

    const updatedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.id, createdEvent.id),
    });

    expect(updatedEvent).toBeDefined();
    expect(updatedEvent!.date.toISOString()).toBe(updatedDate.toISOString());
    expect(updatedEvent!.desc).toBe(updatedDesc);
    expect(updatedEvent!.title).toBe(updatedTitle);
    expect(updatedEvent!.imageUrl).toBe(updatedImageUrl);
  });

  it("should throw 401 when not signed in", async () => {
    const response = await client.api.tickets.events[":eventId"].$patch({
      json: {
        date: new Date(new Date().getTime() + 7200 * 1000),
        desc: "Updated event description",
        title: "updated event title",
        imageUrl: "https://example.com/updated-image.jpg",
        currentVersion: 0,
      },
      param: {
        eventId: "some-event-id",
      },
    });

    expect(response.status).toBe(401);
  });

  it("should throw 403 when signed in as non-admin user", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.USER });
    const response = await client.api.tickets.events[":eventId"].$patch(
      {
        json: {
          date: new Date(new Date().getTime() + 7200 * 1000),
          desc: "Updated event description",
          title: "updated event title",
          imageUrl: "https://example.com/updated-image.jpg",
          currentVersion: 0,
        },
        param: {
          eventId: "some-event-id",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(403);
  });

  it("Should throw 409 when updating with stale version", async () => {
    const title = "test event title";
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),
          desc: "Some event description",
          title: title,
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(201);

    const createdEvent = await response.json();

    const updatedDate = new Date(new Date().getTime() + 7200 * 1000);
    const updatedDesc = "Updated event description";
    const updatedTitle = "updated event title";
    const updatedImageUrl = "https://example.com/updated-image.jpg";

    const firstUpdatedResponse = await client.api.tickets.events[
      ":eventId"
    ].$patch(
      {
        json: {
          date: updatedDate,
          desc: updatedDesc,
          title: updatedTitle,
          imageUrl: updatedImageUrl,
          currentVersion: createdEvent.version,
        },
        param: {
          eventId: createdEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(firstUpdatedResponse.status).toBe(200);

    const secondUpdatedResponse = await client.api.tickets.events[
      ":eventId"
    ].$patch(
      {
        json: {
          date: updatedDate,
          desc: updatedDesc,
          title: updatedTitle,
          imageUrl: updatedImageUrl,
          currentVersion: createdEvent.version,
        },
        param: {
          eventId: createdEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(secondUpdatedResponse.status).toBe(409);
  });

  it("Should throw 400 when invalid date is provided", async () => {
    const title = "test event title";
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });
    const response = await client.api.tickets.events[":eventId"].$patch(
      {
        json: {
          date: "invalid-date",
          desc: "Some event description",
          title: title,
          imageUrl: "https://example.com/image.jpg",
          currentVersion: 0,
        },
        param: {
          eventId: uuidv7(),
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(400);
  });

  it("should allow partial updates", async () => {
    const originalTitle = "original event title";
    const originalDesc = "original event description";
    const originalImageUrl = "https://example.com/original-image.jpg";
    const originalDate = new Date(new Date().getTime() + 3600 * 1000);

    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });
    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: originalDate,
          desc: originalDesc,
          title: originalTitle,
          imageUrl: originalImageUrl,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    const createdEvent = await response.json();

    const updatedTitle = "partially updated event title";
    const updateResponse = await client.api.tickets.events[":eventId"].$patch(
      {
        json: {
          title: updatedTitle,
          currentVersion: createdEvent.version,
        },
        param: {
          eventId: createdEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(updateResponse.status).toBe(200);

    const updatedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.id, createdEvent.id),
    });

    expect(updatedEvent).toBeDefined();
    expect(updatedEvent!.title).toBe(updatedTitle);
    expect(updatedEvent!.desc).toBe(originalDesc);
    expect(updatedEvent!.imageUrl).toBe(originalImageUrl);
  });

  it("should throw 404 when event to be updated is not found", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const updateResponse = await client.api.tickets.events[":eventId"].$patch(
      {
        json: {
          currentVersion: 0,
          title: "some title",
        },
        param: { eventId: uuidv7() },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(updateResponse.status).toBe(404);
  });

  it("Should throw 400 when empty string title is provided", async () => {
    const originalTitle = "original event title";
    const originalDesc = "original event description";
    const originalImageUrl = "https://example.com/original-image.jpg";
    const originalDate = new Date(new Date().getTime() + 3600 * 1000);

    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });
    const response = await client.api.tickets.events.$post(
      {
        json: {
          date: originalDate,
          desc: originalDesc,
          title: originalTitle,
          imageUrl: originalImageUrl,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    const createdEvent = await response.json();

    const updatedTitle = "";
    const updateResponse = await client.api.tickets.events[":eventId"].$patch(
      {
        json: {
          title: updatedTitle,
          currentVersion: createdEvent.version,
        },
        param: {
          eventId: createdEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(updateResponse.status).toBe(400);

    const updatedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.id, createdEvent.id),
    });

    expect(updatedEvent).toBeDefined();
    expect(updatedEvent!.title).toBe(originalTitle);
    expect(updatedEvent!.desc).toBe(originalDesc);
    expect(updatedEvent!.imageUrl).toBe(originalImageUrl);
  });
});

describe("add seat categories to event", () => {
  it("Should throw 400 when event id is not a valid uuid", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const newSeatCategoryResponse = await client.api.tickets.events[":eventId"][
      "seat-categories"
    ].$post(
      {
        json: {
          startRow: 1,
          endRow: 10,
          price: 100,
          seatsPerRow: 20,
        },
        param: {
          eventId: "invalid-uuid",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(newSeatCategoryResponse.status).toBe(400);
  });

  it("should add seat category to an event", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const newEventResponse = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),

          desc: "Some event description",
          title: "Event for seat category",
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );
    expect(newEventResponse.status).toBe(201);

    const newEvent = await newEventResponse.json();

    const newSeatCategoryResponse = await client.api.tickets.events[":eventId"][
      "seat-categories"
    ].$post(
      {
        json: {
          startRow: 1,
          endRow: 10,
          price: 100,
          seatsPerRow: 20,
        },
        param: {
          eventId: newEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(newSeatCategoryResponse.status).toBe(201);
  });

  it("Should throw 404 when event is not found", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const newSeatCategoryResponse = await client.api.tickets.events[":eventId"][
      "seat-categories"
    ].$post(
      {
        json: {
          startRow: 1,
          endRow: 10,
          price: 100,
          seatsPerRow: 20,
        },
        param: {
          eventId: "4bf3ac96-b320-4a58-836a-4ddcab494c17",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(newSeatCategoryResponse.status).toBe(404);
  });

  it("should throw 400 when event is not in draft mode", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const newEvent = await db
      .insert(eventsTable)
      .values({
        title: "Published Event",
        desc: "Some event description",
        date: new Date(new Date().getTime() + 3600 * 1000),
        draft: false,
        imageUrl: "https://example.com/image.jpg",
      })
      .returning();

    const newSeatCategoryResponse = await client.api.tickets.events[":eventId"][
      "seat-categories"
    ].$post(
      {
        json: {
          startRow: 1,
          endRow: 10,
          price: 100,
          seatsPerRow: 20,
        },
        param: {
          eventId: newEvent[0].id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(newSeatCategoryResponse.status).toBe(400);
  });

  describe("tickets creation upon seat category addition", () => {
    it("should add tickets when seat category is created", async () => {
      const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

      const newEventResponse = await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),

            desc: "Some event description",
            title: "Event for seat category",
            imageUrl: "https://example.com/image.jpg",
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      const newEvent = await newEventResponse.json();

      const newSeatCategoryResponse = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: 1,
            endRow: 5,
            price: 100,
            seatsPerRow: 10,
          },
          param: {
            eventId: newEvent.id,
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      expect(newSeatCategoryResponse.status).toBe(201);

      const newSeatCategory = await newSeatCategoryResponse.json();

      const tickets = await db.query.ticketsTable.findMany({
        where: (ticketsTable, { eq }) =>
          eq(ticketsTable.seatCategoryId, newSeatCategory.id),
      });

      // 5 rows * 10 seats per row = 50 tickets
      expect(tickets.length).toBe(50);
    });

    it("should not add tickets when seat category creation fails", async () => {
      const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

      const newEventResponse = await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),

            desc: "Some event description",
            title: "Event for seat category",
            imageUrl: "https://example.com/image.jpg",
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      const newEvent = await newEventResponse.json();

      // First seat category creation
      await client.api.tickets.events[":eventId"]["seat-categories"].$post(
        {
          json: {
            startRow: 1,
            endRow: 5,
            price: 100,
            seatsPerRow: 10,
          },
          param: {
            eventId: newEvent.id,
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      // Second seat category creation with overlapping rows
      const newSeatCategoryResponse2 = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: 3, // Overlaps with previous seat category
            endRow: 7,
            price: 100,
            seatsPerRow: 10,
          },
          param: {
            eventId: newEvent.id,
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      expect(newSeatCategoryResponse2.status).toBe(400);
      const newSeatCategory2 = await newSeatCategoryResponse2.json();

      const tickets = await db.query.ticketsTable.findMany({
        where: (ticketsTable, { eq }) =>
          eq(ticketsTable.seatCategoryId, newSeatCategory2.id),
      });

      // No tickets should be created for the failed seat category addition
      expect(tickets.length).toBe(0);
    });

    it("created tickets should have null userId by default", async () => {
      const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

      const newEventResponse = await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),

            desc: "Some event description",
            title: "Event for seat category",
            imageUrl: "https://example.com/image.jpg",
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      const newEvent = await newEventResponse.json();
      const newSeatCategoryResponse = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: 1,
            endRow: 5,
            price: 100,
            seatsPerRow: 10,
          },
          param: {
            eventId: newEvent.id,
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      expect(newSeatCategoryResponse.status).toBe(201);

      const newSeatCategory = await newSeatCategoryResponse.json();

      const tickets = await db.query.ticketsTable.findMany({
        where: (ticketsTable, { eq }) =>
          eq(ticketsTable.seatCategoryId, newSeatCategory.id),
      });

      for (const ticket of tickets) {
        expect(ticket.userId).toBeNull();
      }
    });
  });
  it("should call addEventToOutBox when seat category is created", async () => {
    const outboxSpy = vi.spyOn(outbox, "addEventToOutBox");

    const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

    const newEventResponse = await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(new Date().getTime() + 3600 * 1000),

          desc: "Some event description",
          title: "Event for seat category",
          imageUrl: "https://example.com/image.jpg",
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    const newEvent = await newEventResponse.json();

    const startRow = 1;
    const endRow = 5;
    const seatsPerRow = 10;
    const price = 100;

    const newSeatCategoryResponse = await client.api.tickets.events[":eventId"][
      "seat-categories"
    ].$post(
      {
        json: {
          startRow,
          endRow,
          price,
          seatsPerRow,
        },
        param: {
          eventId: newEvent.id,
        },
      },
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    const result = await newSeatCategoryResponse.json();
    // pl.trace(outboxSpy.mock.calls[0][1], "outboxSpy calls");

    const [txn, event] = outboxSpy.mock.calls[0];
    expect(event.data).toHaveLength((endRow - startRow + 1) * seatsPerRow);
    expect(newSeatCategoryResponse.status).toBe(201);
    expect(outboxSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subject: expect.stringContaining(Subjects.TicketsCreated),
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            price,
            seatCategoryId: result.id,
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), // ISO date format
          }),
        ]),
      }),
    );
    outboxSpy.mockRestore();
  });

  describe("should not be able to add multiple seat categories if rows overlap", () => {
    const setup = async (
      s1: number,
      e1: number,
      s2: number,
      e2: number,
    ): Promise<{
      status1: number;
      status2: number;
    }> => {
      const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

      const newEventResponse = await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),

            desc: "Some event description",
            title: "Event for seat category",
            imageUrl: "https://example.com/image.jpg",
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      const newEvent = await newEventResponse.json();

      const newSeatCategoryResponse = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: s1,
            endRow: e1,
            price: 100,
            seatsPerRow: 20,
          },
          param: {
            eventId: newEvent.id,
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      const newSeatCategoryResponse2 = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: s2,
            endRow: e2,
            price: 100,
            seatsPerRow: 20,
          },
          param: {
            eventId: newEvent.id,
          },
        },
        {
          headers: {
            Cookie: cookieJwt,
          },
        },
      );

      return {
        status1: newSeatCategoryResponse.status,
        status2: newSeatCategoryResponse2.status,
      };
    };
    it("should not pass 1 - 10 and 5 - 15", async () => {
      const { status1, status2 } = await setup(1, 10, 5, 15);
      expect(status1).toBe(201);
      expect(status2).toBe(400);
    });

    it("should not pass 1 - 10 and 10 - 20", async () => {
      const { status1, status2 } = await setup(1, 10, 10, 20);
      expect(status1).toBe(201);
      expect(status2).toBe(400);
    });

    it("should not pass 1 - 10 and 2 - 8", async () => {
      const { status1, status2 } = await setup(1, 10, 2, 8);
      expect(status1).toBe(201);
      expect(status2).toBe(400);
    });
    it("should not pass 10 - 15 and 8 - 20", async () => {
      const { status1, status2 } = await setup(10, 15, 8, 20);
      expect(status1).toBe(201);
      expect(status2).toBe(400);
    });

    it("should not pass 5 - 25 and 1 - 10", async () => {
      const { status1, status2 } = await setup(5, 25, 1, 10);
      expect(status1).toBe(201);
      expect(status2).toBe(400);
    });

    it("should pass 1 - 5 and 6 - 10", async () => {
      const { status1, status2 } = await setup(1, 5, 6, 10);
      expect(status1).toBe(201);
      expect(status2).toBe(201);
    });

    it("should pass 1 - 10 and 11 - 20", async () => {
      const { status1, status2 } = await setup(1, 10, 11, 20);
      expect(status1).toBe(201);
      expect(status2).toBe(201);
    });
  });
});
