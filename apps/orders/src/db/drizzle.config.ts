import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: `postgresql://${process.env.ORDERS_POSTGRES_USER}:${process.env.ORDERS_POSTGRES_PASSWORD}@orders-postgres-srv:5432/${process.env.ORDERS_POSTGRES_DB}`,
  },
  casing: "snake_case",
});
