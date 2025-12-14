import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";

export const requireAuth = async (c: Context, next: Next) => {
  const currentUserId = c.get("currentUserId");
  if (!currentUserId) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  await next();
};
