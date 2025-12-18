import { Hono } from "hono";

const app = new Hono();

app.get("/api/tickets", (c) => {
  return c.json({ message: "Hello ticket service!" });
});

export default app;
