"use client";

import { useUser } from "@/app/context/user.context";
import { Avatar, Box, Button, Typography } from "@mui/material";
import { hcAuthClient } from "@/app/lib/hc-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export const RightMenu = () => {
  const { currentUser, setCurrentUser } = useUser();
  const router = useRouter();

  if (currentUser === undefined) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {currentUser ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar src={currentUser?.picture} />
          <Typography variant="body1">{currentUser?.email}</Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              hcAuthClient.api.auth["signout"]
                .$post()
                .then(async (response) => {
                  console.log(response);
                  console.log(await response.json());
                  setCurrentUser(null);
                  router.replace("/");
                });
            }}
          >
            Logout
          </Button>
        </Box>
      ) : (
        <Link href="/login">
          <Button variant="contained" color="primary">
            Login
          </Button>
        </Link>
      )}
    </div>
  );
};
