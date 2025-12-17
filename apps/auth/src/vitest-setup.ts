import { beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { User } from "./models/user";
import { sign } from "hono/jwt";

declare global {
  var signin: (email?: string) => Promise<string>;
}

let mongo: MongoMemoryServer;

beforeAll(async () => {
  process.env.JWT_KEY = "asoifhgosidf";
  mongo = await MongoMemoryServer.create({
    instance: {
      dbName: "test",
    },
    binary: {
      version: "7.0.14",
    },
  });
  const mongoUri = mongo.getUri();
  await mongoose.connect(mongoUri);
  console.log("Connected to in-memory MongoDB");
});

afterAll(async () => {
  if (mongo) {
    await mongo.stop();
  }
  await mongoose.connection.close();
});

global.signin = async (email) => {
  email = email || "test@test.com";
  const user = User.build({ email, picture: "test-picture" });
  await user.save();

  const cookieJwt = await sign(
    {
      id: user.id,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // Token expires in 7 days
    },
    process.env.JWT_KEY!,
  );

  return `session=${cookieJwt}`;
};
