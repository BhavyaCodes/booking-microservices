import { testClient } from "hono/testing";
import { app as ticketsApp } from "../app";
import { describe, it, expect } from "vitest";
import { UserRoles } from "@booking/common/interfaces";

const client = testClient(ticketsApp);

describe("test if admin only route protection is working", () => {
  it("should throw 401 when not signed in", async () => {
    const response = await client.api.tickets.events.$post();

    expect(response.status).toBe(401);
  });

  it("should throw 403 when signed in as non-admin user", async () => {
    const cookieJwt = await global.signin({ role: UserRoles.USER });

    const response = await client.api.tickets.events.$post(
      {},
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );

    expect(response.status).toBe(403);
  });
});
