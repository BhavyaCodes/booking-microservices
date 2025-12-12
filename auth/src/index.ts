import { Hono } from "hono";

const app = new Hono();

app.get("/api/auth", (c) => {
  return c.text("Hello Hono!");
});

export default app;
