import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { CurrentUser } from "../interfaces";

export const requireAuth = async (c: Context, next: Next) => {
  const currentUserId = (c.get("currentUser") as CurrentUser | undefined)?.id;
  if (!currentUserId) {
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

  await next();
};
