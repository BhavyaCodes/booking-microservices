import { testClient } from "hono/testing";
import { app as ticketsApp } from "../app";
import { describe, it, expect } from "vitest";
import { UserRoles } from "@booking/common/interfaces";
import { db } from "../db";
import { eventsTable } from "../db/schema";

const client = testClient(ticketsApp);

describe("check enviornment NODE_ENV", () => {
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
          date: new Date(),
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

    const insertedEvent = await db.query.eventsTable.findFirst({
      where: (eventsTable, { eq }) => eq(eventsTable.title, title),
    });
    console.log("🚀 ~ insertedEvent:", insertedEvent);

    expect(insertedEvent).not.toBeNullable();
  });
});

it("should create event in the database", async () => {
  const title = "test event title";
  const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

  const response = await client.api.tickets.events.$post(
    {
      json: {
        date: new Date(),
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

  expect(insertedEvent).not.toBeNullable();
});

it("should be able to store multiple events in the database", async () => {
  const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

  const titles = ["event 1", "event 2", "event 3"];

  for (const title of titles) {
    await client.api.tickets.events.$post(
      {
        json: {
          date: new Date(),
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
    expect(insertedEvent).not.toBeNullable();
  }
});

it("event should have draft set to true by default", async () => {
  const title = "draft test event";
  const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

  await client.api.tickets.events.$post(
    {
      json: {
        date: new Date(),
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

  expect(insertedEvent).not.toBeNullable();
  expect(insertedEvent!.draft).toBe(true);
});
