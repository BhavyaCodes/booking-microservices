import { getHcTicketsServer } from "@/app/lib/hc-server";
import { cookies } from "next/headers";
import { EventCard } from "./EventCard";
import { Grid } from "@mui/material";

export default async function Events() {
  const cookieStore = await cookies();
  const ticketsClient = getHcTicketsServer(cookieStore);

  const ticketsResponse = await ticketsClient.api.tickets.events.$get();
  const tickets = await ticketsResponse.json();

  return (
    <Grid container spacing={2}>
      {tickets.map((ticket: (typeof tickets)[number]) => (
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={ticket.id}>
          <EventCard {...ticket} />
        </Grid>
      ))}
    </Grid>
  );
}
