"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { UseGoogleLogin } from "./useGoogleLogin";

const Page = () => {
  return (
    <div>
      <GoogleOAuthProvider clientId="1007168800385-95bastm7ibbjj8dgk48to0qt1bee90pa.apps.googleusercontent.com">
        <UseGoogleLogin />
      </GoogleOAuthProvider>
    </div>
  );
};

export default Page;
