"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { UseGoogleLogin } from "./useGoogleLogin";
import { authClient } from "@booking/auth/app";
import { useEffect } from "react";

const Page = () => {
  useEffect(() => {
    authClient.api.auth["current-user"].$get().then(async (response) => {
      console.log("Current User:", await response.json());
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
