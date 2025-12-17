import { testClient } from "hono/testing";
import { app as authApp } from "../app";
import { describe, it, expect } from "vitest";

describe("sample test", () => {
  it("should run test", () => {
    expect(1 + 1).toBe(2);
  });

  it("should not be able to signout when not signed in", async () => {
    const client = testClient(authApp);
    const response = await client.api.auth.signout.$post();
    expect(response.status).toBe(401);
  });
});
