import type { CurrentUser } from "@booking/common/interfaces";
import { extractCurrentUser } from "@booking/common/middlewares";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { db } from "./db";
import { OrderStatus } from "./db/schema";

const app = new Hono<{
  Variables: {
    currentUser: CurrentUser;
  };
}>()
  .use(logger())
  .use(extractCurrentUser)
  .get("/api/orders", (c) => {
    return c.text("Hello from orders service!");
  })
  .get("/api/orders/pending", async (c) => {
    const currentUser = c.get("currentUser");

    const pendingOrder = await db.query.ordersTable.findFirst({
      where(fields, { eq, and }) {
        return and(
          eq(fields.userId, currentUser!.id),
          eq(fields.status, OrderStatus.CREATED),
        );
      },
    });

    return c.json({
      order: pendingOrder || null,
    });
  });

export { app };
