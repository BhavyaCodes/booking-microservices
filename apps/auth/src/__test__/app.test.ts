import { testClient } from "hono/testing";
import { app as authApp } from "../app";
import { describe, it, expect } from "vitest";

const client = testClient(authApp);

describe("sample test", () => {
  it("should run test", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("test if route protection is working", () => {
  it("should not be able to signout when not signed in", async () => {
    const response = await client.api.auth.signout.$post();
    expect(response.status).toBe(401);
  });

  it("should be able to signout when signed in", async () => {
    const cookieJwt = await global.signin();

    const response = await client.api.auth.signout.$post(
      {},
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );
    expect(response.status).toBe(200);
  });
});

describe("current-user route", () => {
  it("should return null when not signed in", async () => {
    const response = await client.api.auth["current-user"].$get();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.currentUser).toBeNull();
  });

  it("should return current user when signed in", async () => {
    const testEmail = "chattan@singh.com";
    const cookieJwt = await global.signin(testEmail);

    const response = await client.api.auth["current-user"].$get(
      {},
      {
        headers: {
          Cookie: cookieJwt,
        },
      },
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.currentUser.email).toBe(testEmail);
  });
});
