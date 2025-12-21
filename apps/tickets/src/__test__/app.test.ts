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

  describe("validate maximum ticket limit", () => {
    it("should reject seat category creation when total tickets exceed 10,000", async () => {
      const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

      const newEventResponse = await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),
            desc: "Some event description",
            title: "Event for large seat category",
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

      // 101 rows * 100 seats = 10,100 tickets (exceeds limit)
      const newSeatCategoryResponse = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: 1,
            endRow: 101,
            price: 100,
            seatsPerRow: 100,
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

      expect(newSeatCategoryResponse.status).toBe(400);
      const errorResponse = await newSeatCategoryResponse.json();
      expect(errorResponse.error).toBeDefined();
    });

    it("should allow seat category creation when total tickets is exactly 10,000", async () => {
      const cookieJwt = await global.signin({ role: UserRoles.ADMIN });

      const newEventResponse = await client.api.tickets.events.$post(
        {
          json: {
            date: new Date(new Date().getTime() + 3600 * 1000),
            desc: "Some event description",
            title: "Event for max seat category",
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

      // 100 rows * 100 seats = 10,000 tickets (exactly at limit)
      const newSeatCategoryResponse = await client.api.tickets.events[
        ":eventId"
      ]["seat-categories"].$post(
        {
          json: {
            startRow: 1,
            endRow: 100,
            price: 100,
            seatsPerRow: 100,
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

      expect(tickets.length).toBe(10000);
    });
  });
});
