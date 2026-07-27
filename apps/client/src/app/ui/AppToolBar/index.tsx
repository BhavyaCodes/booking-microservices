import { AppBar, Box, Toolbar, Typography } from "@mui/material";
import Link from "next/link";
import { RightMenu } from "./RightMenu";

export const AppToolbar = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Box
          sx={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 2 }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            <Typography variant="h6" color="primary">
              Syncro
            </Typography>
          </Link>
          <nav>
            <Link href="/orders">orders</Link>
          </nav>
        </Box>
        <RightMenu />
      </Toolbar>
    </AppBar>
  );
};
