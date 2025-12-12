import { Hono } from "hono";
import { logger } from "hono/logger";
import axios, { AxiosError } from "axios";

const app = new Hono();

app.use(logger());

app.get("/api/auth", (c) => {
  return c.text("Hello Hono!");
});

app.get("/api/auth/google-callback", async (c) => {
  console.log("Google callback hit");
  const code = c.req.query("code");
  console.log("Authorization code:", code);
  // return c.text("Google callback received. Authorization code: " + code);

  try {
    const respone = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      grant_type: "authorization_code",
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    });

    console.log("🚀 ~ respone:", respone.data);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      console.log("Axios error response data:", error.response?.data);
    } else {
      console.log("Unexpected error:", error);
    }
  }

  return c.redirect("/");
});

export { app };
