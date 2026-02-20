import { Hono } from "hono";
import { logger } from "hono/logger";
import axios, { AxiosError } from "axios";
import { decode, sign } from "hono/jwt";
import { User, UserRoles } from "./models/user";
import { deleteCookie, setCookie } from "hono/cookie";
import { extractCurrentUser, requireAuth } from "@booking/common/middlewares";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { compare } from "bcryptjs";
import { CurrentUser } from "@booking/common/interfaces";
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
  zodValidationHook,
} from "@booking/common";

interface GoogleIdTokenPayload {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  at_hash: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
  iat: number;
  exp: number;
}

const app = new Hono<{
  Variables: {
    currentUser: CurrentUser;
  };
}>()
  .use(logger())
  .use(extractCurrentUser)
  .get("/api/auth", (c) => {
    return c.text("Hello Hono!");
  })
  .get("/api/auth/google-callback", async (c) => {
    const code = c.req.query("code");

    const response = await axios
      .post<{ id_token: string }>("https://oauth2.googleapis.com/token", {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        grant_type: "authorization_code",
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      })
      .catch((error) => {
        if (error instanceof AxiosError) {
          console.error("Axios error response data:", error.response?.data);
        } else {
          console.error("Unexpected error:", error);
        }
        throw new HTTPException(500, {
          res: new CustomErrorResponse({
            message: "Failed to exchange code for tokens",
            code: ErrorCodes.OAUTH_TOKEN_EXCHANGE_FAILED,
          }),
        });
      });

    const jwtPayload = decode(response.data.id_token)
      .payload as unknown as GoogleIdTokenPayload;

    // check if user exists in db

    const existingUser = await User.findOne({
      email: jwtPayload.email,
    });

    if (existingUser) {
      const cookieJwt = await sign(
        {
          id: existingUser.id,
          role: existingUser.role,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // Token expires in 7 days
        },
        process.env.JWT_KEY!,
      );

      setCookie(c, "session", cookieJwt, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      return c.redirect("/");
    }

    const user = User.build({
      email: jwtPayload.email,
      picture: jwtPayload.picture,
    });

    await user.save();

    const cookieJwt = await sign(
      {
        id: user.id,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // Token expires in 7 days
      },
      process.env.JWT_KEY!,
      "HS256",
    );

    setCookie(c, "session", cookieJwt, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    return c.redirect("/");
  })
  .get("/api/auth/current-user", requireAuth, async (c) => {
    const currentUserId = c.get("currentUser").id;
    const user = await User.findById(currentUserId);
    return c.json({ currentUser: user });
  })
  .post("/api/auth/signout", requireAuth, (c) => {
    deleteCookie(c, "session");
    return c.json({ message: "Signed out" });
  })
  // TODO: add rate limiting to this route
  .post(
    "/api/auth/create-admin",
    requireAuth,
    zValidator(
      "json",
      z.object({
        password: z
          .string({ error: "Create admin password is required" })
          .min(1),
        email: z.email("Valid email is required"),
      }),
      zodValidationHook,
    ),
    async (c) => {
      const email = c.req.valid("json").email;
      const password = c.req.valid("json").password;

      const isMatch = await compare(
        password,
        process.env.AUTH_CREATE_ADMIN_HASH,
      );

      if (!isMatch) {
        throw new HTTPException(401, {
          res: new CustomErrorResponse({
            message: "Incorrect password",
            code: ErrorCodes.INCORRECT_PASSWORD,
          }),
        });
      }

      const user = await User.findOne({ email });

      if (!user) {
        throw new HTTPException(404, {
          res: new CustomErrorResponse({
            message: "User not found",
            code: ErrorCodes.USER_NOT_FOUND,
          }),
        });
      }

      user.role = UserRoles.ADMIN;
      await user.save();

      return c.json({ message: "User promoted to admin successfully" }, 201);
    },
  )
  .onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    } else {
      console.error("Unhandled error:", error);
      return c.json({ message: "Internal Server Error" }, 500);
    }
  });

export { app };
