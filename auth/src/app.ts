import { Hono } from "hono";
import { logger } from "hono/logger";
import axios, { AxiosError } from "axios";
import { decode, sign, verify } from "hono/jwt";
import { User } from "./models/user";
import { getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";

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
    currentUserId?: string;
  };
}>();

app.use(logger());

app.use(async (c, next) => {
  const sessionCookie = getCookie(c, "session");
  if (!sessionCookie) {
    return next();
  }

  try {
    const payload = await verify(sessionCookie, process.env.JWT_KEY!);
    c.set("currentUserId", payload.id as string);
  } catch (err) {
    throw new HTTPException(401, { message: "Invalid session" });
  }
  await next();
});

app.get("/api/auth", (c) => {
  return c.text("Hello Hono!");
});

app.get("/api/auth/google-callback", async (c) => {
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
      throw new HTTPException(500, { message: "Google OAuth failed" });
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

  const cookieJwt = await sign({ id: user.id }, process.env.JWT_KEY!);

  setCookie(c, "session", cookieJwt, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  return c.redirect("/");
});

app.get("/api/auth/current-user", async (c) => {
  const currentUserId = c.get("currentUserId");
  if (!currentUserId) {
    return c.json({ currentUser: null });
  }

  const user = await User.findById(currentUserId);
  return c.json({ currentUser: user });
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    console.error(error.cause);
    return error.getResponse();
  } else {
    console.error("Unhandled error:", error);
    throw new HTTPException(500, {
      cause: error,
      message: "Internal Server Error",
    });
  }
});

export { app };
