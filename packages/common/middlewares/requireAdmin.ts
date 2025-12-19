import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { UserRoles, type CurrentUser } from "../interfaces";

export const requireAdmin = async (c: Context, next: Next) => {
  const currentUser = c.get("currentUser") as CurrentUser | undefined;
  if (!currentUser) {
    throw new HTTPException(401, {
      res: new Response(
        JSON.stringify({
          message: "Not authenticated",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    });
  }

  if (currentUser.role === UserRoles.ADMIN) {
    await next();
  } else {
    throw new HTTPException(401, {
      res: new Response(
        JSON.stringify({
          message: "Not authorized",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    });
  }
};
