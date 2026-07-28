import { getHcTicketsServer } from "@/app/lib/hc-server";
import { Typography } from "@mui/material";
import { cookies } from "next/headers";
import {
  SeatMap,
  type SeatCategoryWithTickets,
} from "./SeatMap";

const BookPage = async ({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) => {
  const { eventId } = await params;
  const cookieStore = await cookies();
  const ticketsClient = getHcTicketsServer(cookieStore);

  const ticketsWithSeatCategoriesResponse =
    await ticketsClient.api.tickets.events[":eventId"].tickets.$get({
      param: {
        eventId,
      },
    });

  if (!ticketsWithSeatCategoriesResponse.ok) {
    return (
      <Typography sx={{ p: 3 }} color="error">
        Unable to load seats for this event. Please try again.
      </Typography>
    );
  }

  const ticketsWithSeatCategories =
    (await ticketsWithSeatCategoriesResponse.json()) as SeatCategoryWithTickets[];

  if (ticketsWithSeatCategories.length === 0) {
    return (
      <Typography sx={{ p: 3 }} color="text.secondary">
        No seats available for this event.
      </Typography>
    );
  }

  return <SeatMap categories={ticketsWithSeatCategories} />;
};

export default BookPage;
