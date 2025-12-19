import { Hono } from "hono";
import { logger } from "hono/logger";
import { extractCurrentUser, requireAdmin } from "@booking/common/middlewares";
import { HTTPException } from "hono/http-exception";
import { CurrentUser } from "@booking/common/interfaces";

const app = new Hono<{
  Variables: {
    currentUser: CurrentUser;
  };
}>()
  .use(logger())
  .use(extractCurrentUser)
  .get("/api/tickets", (c) => {
    console.log("Hello ticket service !!");
    return c.json({ message: "Hello ticket serviceeee !!" });
  })
  .post("/api/tickets/events", requireAdmin, async (c) => {
    return c.json({ message: "Creating an event" });
  })
  .onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    } else {
      console.error("Unhandled error:", error);
      throw new HTTPException(500, {
        res: new Response(
          JSON.stringify({
            message: "Internal Server Error",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        ),
      });
    }
  });
export { app };
