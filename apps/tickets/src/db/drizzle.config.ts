import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@tickets-postgres-srv:5432/${process.env.POSTGRES_DB}`,
  },
  casing: "snake_case",
});
