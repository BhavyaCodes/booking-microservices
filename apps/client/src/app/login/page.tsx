"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { UseGoogleLogin } from "./useGoogleLogin";
import { AuthAppType, hc } from "@booking/auth/client";
import { useEffect } from "react";

const Page = () => {
  const authClient = hc<AuthAppType>(process.env.NEXT_PUBLIC_BASE_URL!);
  console.log("Base URL:", process.env.NEXT_PUBLIC_BASE_URL);
  useEffect(() => {
    authClient.api.auth["current-user"]
      .$get()
      .then(async (response) => {
        console.log("Current User:", await response.json());
      })
      .catch((error) => {
        console.error("Error fetching current user:", error);
      });
  }, []);

  return (
    <div>
      <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
        <UseGoogleLogin />
      </GoogleOAuthProvider>
    </div>
  );
};

export default Page;
