import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
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
    throw new HTTPException(401, {
      res: new Response(
        JSON.stringify({
          message: "Invalid session",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    });
  }
  await next();
};
