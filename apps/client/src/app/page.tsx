import { Box, Typography } from "@mui/material";
import Events from "@/app/ui/landing-page/Events";

export default function Home() {
  return (
    <div>
      <main>
        <Box>
          <Typography variant="h2" component="h1">
            EventPulse
          </Typography>
          <Typography variant="body1">
            EventPulse is a platform for creating and managing events.
          </Typography>
        </Box>
        <Events />
      </main>
    </div>
  );
}
