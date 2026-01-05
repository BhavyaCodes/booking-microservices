import { Hono } from "hono";

const app = new Hono();

app.get("/api/orders", (c) => {
  return c.text("Hello from orders service!");
});

export { app };
