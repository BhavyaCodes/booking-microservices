import { testClient } from "hono/testing";
import { app as authApp } from "../app";
import { describe, it, expect } from "vitest";
import { User, UserRoles } from "../models/user";

const client = testClient(authApp);

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
  it("should return 401 when not signed in", async () => {
    const response = await client.api.auth["current-user"].$get();
    expect(response.status).toBe(401);
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

describe("create-admin endpoint", () => {
  it("should return 401 when not signed in", async () => {
    const response = await client.api.auth["create-admin"].$post({
      json: {
        password: "somepassword",
        email: "someemail@example.com",
      },
    });
    expect(response.status).toBe(401);
  });

  it("should return 400 when email is not provided", async () => {
    const user1 = await global.signin("test1@test.com");
    const response = await client.api.auth["create-admin"].$post(
      {
        //@ts-expect-error testing invalid input
        json: {
          password: "somepassword",
          // email: "someemail@example.com",
        },
      },
      {
        headers: {
          Cookie: user1,
        },
      },
    );
    expect(response.status).toBe(400);
  });

  it("should return 400 when password is not provided", async () => {
    const user1 = await global.signin("test1@test.com");
    const response = await client.api.auth["create-admin"].$post(
      {
        //@ts-expect-error testing invalid input
        json: {
          // password: "somepassword",
          email: "someemail@example.com",
        },
      },
      {
        headers: {
          Cookie: user1,
        },
      },
    );
    expect(response.status).toBe(400);
  });

  it("should return 401 when incorrect password is provided", async () => {
    const user1 = await global.signin("test1@test.com");
    const response = await client.api.auth["create-admin"].$post(
      {
        json: {
          password: "somepassword",
          email: "someemail@example.com",
        },
      },
      {
        headers: {
          Cookie: user1,
        },
      },
    );
    expect(response.status).toBe(401);
  });

  it("should return 404 when user with provided email does not exist", async () => {
    const email = "test1@test.com";
    const user1 = await global.signin(email);
    const response = await client.api.auth["create-admin"].$post(
      {
        json: {
          password: global.createAdminPassword,
          email: "someemail@example.com",
        },
      },
      {
        headers: {
          Cookie: user1,
        },
      },
    );
    expect(response.status).toBe(404);
  });

  it("should promote user to admin when valid inputs are provided", async () => {
    const email1 = "test1@test.com";
    const email2 = "test2@test.com";
    const user1 = await global.signin(email1);
    await global.signin(email2);

    const response = await client.api.auth["create-admin"].$post(
      {
        json: {
          password: global.createAdminPassword,
          email: email2,
        },
      },
      {
        headers: {
          Cookie: user1,
        },
      },
    );
    expect(response.status).toBe(201);

    const user2Doc = await User.findOne({ email: email2 });
    expect(user2Doc!.role).toBe(UserRoles.ADMIN);
  });

  it("user should be able to promote himself to admin", async () => {
    const email1 = "test1@test.com";

    const user1 = await global.signin(email1);

    const response = await client.api.auth["create-admin"].$post(
      {
        json: {
          password: global.createAdminPassword,
          email: email1,
        },
      },
      {
        headers: {
          Cookie: user1,
        },
      },
    );
    expect(response.status).toBe(201);

    const user2Doc = await User.findOne({ email: email1 });
    expect(user2Doc!.role).toBe(UserRoles.ADMIN);
  });
});
