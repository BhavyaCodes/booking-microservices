import type { Context } from "hono";
import { z } from "zod";
import { ErrorCodes } from "./CustomErrorResponse";
import { HTTPException } from "hono/http-exception";

export const zodValidationHook = (result: any, c: Context) => {
  if (!result.success) {
    throw new HTTPException(400, {
      res: new Response(
        JSON.stringify({
          message: "Validation failed",
          code: ErrorCodes.VALIDATION_FAILED,
          data: z.treeifyError(result.error),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    });
  }
};
