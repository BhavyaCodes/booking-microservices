import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { UserRoles } from "../interfaces";

export const extractCurrentUser = async (c: Context, next: Next) => {
  const sessionCookie = getCookie(c, "session");
  if (!sessionCookie) {
    return next();
  }

  try {
    const payload = await verify(sessionCookie, process.env.JWT_KEY!);
    c.set("currentUser", {
      id: payload.id as string,
      role: payload.role as UserRoles,
    });
  } catch (err) {
    console.error("JWT verification failed:", err);
    // Don't throw here - just don't set currentUser
    // The requireAuth middleware will handle the 401 response
  }
  return await next();
};
