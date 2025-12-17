import { useGoogleLogin } from "@react-oauth/google";

export const UseGoogleLogin = () => {
  const login = useGoogleLogin({
    flow: "auth-code",
    redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI,
    ux_mode: "redirect",
  });

  return (
    <div>
      UseGoogleLogin
      <button onClick={() => login()}>Sign in with Google 🚀 </button>
    </div>
  );
};
