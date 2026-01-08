import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: `postgresql://test:test@localhost:5432/test`,
  },
  casing: "snake_case",
});
