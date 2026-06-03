import { getHcTicketsServer } from "@/app/lib/hc-server";
import { Button, Card, CardContent, Grid, Typography } from "@mui/material";
import { cookies } from "next/headers";

export const EventPricing = async ({ eventId }: { eventId: string }) => {
  const cookieStore = await cookies();
  const ticketsClient = getHcTicketsServer(cookieStore);

  const seatCategoriesResponse = await ticketsClient.api.tickets.events[
    ":eventId"
  ]["seat-categories"].$get({
    param: {
      eventId,
    },
  });

  const seatCategories = await seatCategoriesResponse.json();

  const lowestPrice = seatCategories.reduce(
    (min: number, seatCategory: any) => {
      return Math.min(min, seatCategory.price);
    },
    Infinity,
  );

  return (
    <div>
      <Grid container spacing={2}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Starting from: ₹{lowestPrice / 100}
            </Typography>
            <Button variant="contained" color="primary">
              Book Now
            </Button>
          </CardContent>
        </Card>
      </Grid>
    </div>
  );
};
