import { Box, Typography } from "@mui/material";

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
      </main>
    </div>
  );
}
