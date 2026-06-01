"use client";

import { useUser } from "@/app/context/user.context";
import { Avatar, Button, Typography } from "@mui/material";
import { hcAuthClient } from "@/app/lib/hc-client";
import { useRouter } from "next/navigation";

export const RightMenu = () => {
  const { currentUser, setCurrentUser } = useUser();
  const router = useRouter();
  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Avatar src={currentUser?.picture} />
      <Typography variant="body1">{currentUser?.email}</Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={() => {
          hcAuthClient.api.auth["signout"].$post().then(async (response) => {
            console.log(response);
            console.log(await response.json());
            setCurrentUser(null);
            router.replace("/");
          });
        }}
      >
        Logout
      </Button>
    </div>
  );
};
