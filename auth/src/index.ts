import mongoose from "mongoose";
import { app } from "./app";

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be present");
  }

  if (!process.env.JWT_KEY) {
    throw new Error("JWT_KEY must be present");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 ~ connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  }

  Bun.serve({
    port: 3000,
    fetch: app.fetch,
  });
};

main().catch((err) => {
  console.error("Failed to start the application", err);
  process.exit(1);
});
