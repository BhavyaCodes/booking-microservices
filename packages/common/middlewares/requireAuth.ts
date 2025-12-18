import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

export const requireAuth = async (c: Context, next: Next) => {
  const currentUserId = c.get("currentUser")?.id;
  if (!currentUserId) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  await next();
};
