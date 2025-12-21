import { testClient } from "hono/testing";
import { app as ticketsApp } from "../app";
import { describe, it, expect } from "vitest";
import { UserRoles } from "@booking/common/interfaces";
import { db } from "../db";
import { eventsTable } from "../db/schema";

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

describe("add seat categories to event", () => {
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

    const newSeatCategoryResponse = await client.api.tickets.events[":eventId"][
      "seat-categories"
    ].$post(
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

  it("should be able to add multiple seat categories to an event", async () => {
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

    const newSeatCategoryResponse2 = await client.api.tickets.events[
      ":eventId"
    ]["seat-categories"].$post(
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
    expect(newSeatCategoryResponse2.status).toBe(201);

    const eventSeatCategories = await db.query.seatCategoriesTable.findMany({
      where: (seatCategoriesTable, { eq }) =>
        eq(seatCategoriesTable.eventId, newEvent.id),
    });

    expect(eventSeatCategories.length).toBe(2);
  });
});
