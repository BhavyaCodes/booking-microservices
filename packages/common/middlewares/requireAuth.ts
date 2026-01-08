import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { CurrentUser } from "../interfaces";
import { CustomErrorResponse, ErrorCodes } from "../error/CustomErrorResponse";

export const requireAuth = async (c: Context, next: Next) => {
  const currentUserId = (c.get("currentUser") as CurrentUser | undefined)?.id;
  if (!currentUserId) {
    throw new HTTPException(401, {
      res: new CustomErrorResponse({
        message: "not authenticated",
        code: ErrorCodes.INVALID_SESSION,
      }),
    });
  }

  await next();
};
