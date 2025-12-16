"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { UseGoogleLogin } from "./useGoogleLogin";

const Page = () => {
  return (
    <div>
      <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
        <UseGoogleLogin />
      </GoogleOAuthProvider>
    </div>
  );
};

export default Page;
