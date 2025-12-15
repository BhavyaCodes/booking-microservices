import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";

export const extractCurrentUser = async (c: Context, next: Next) => {
  const sessionCookie = getCookie(c, "session");
  if (!sessionCookie) {
    return next();
  }

  try {
    const payload = await verify(sessionCookie, process.env.JWT_KEY!);
    c.set("currentUserId", payload.id as string);
  } catch (err) {
    throw new HTTPException(401, { message: "Invalid session" });
  }
  await next();
};
