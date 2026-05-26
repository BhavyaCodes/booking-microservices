import { AppBar, Toolbar, Typography } from "@mui/material";
import Link from "next/link";

export const AppToolbar = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <nav>
          <Link href="/login">Login</Link>
          <Link href="/orders">orders</Link>
        </nav>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 1 }}
          color="primary"
        >
          EventPulse
        </Typography>
      </Toolbar>
    </AppBar>
  );
};
