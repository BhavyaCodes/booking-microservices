import { beforeAll, afterAll, afterEach, beforeEach } from "vitest";

import { sign } from "hono/jwt";
import { randomUUID } from "crypto";
import { UserRoles } from "@booking/common/interfaces";
import { db } from "./db";
import { outboxTable, ticketsTable } from "./db/schema";

declare global {
  var signin: (options?: { id?: string; role?: UserRoles }) => Promise<string>;
}

beforeAll(async () => {
  process.env.JWT_KEY = "asoifhgosidf";
});

beforeEach(async () => {
  await db.delete(ticketsTable);
  await db.delete(outboxTable);
});

global.signin = async (options) => {
  const cookieJwt = await sign(
    {
      id: options?.id || randomUUID(),
      role: options?.role || UserRoles.USER,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // Token expires in 7 days
    },
    process.env.JWT_KEY!,
  );

  return `session=${cookieJwt}`;
};
