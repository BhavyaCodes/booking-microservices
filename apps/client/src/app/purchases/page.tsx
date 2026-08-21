import { Box, Card, CardContent, Container, Typography } from "@mui/material";
import { getHcOrdersServer, getHcTicketsServer } from "../lib/hc-server";
import { cookies } from "next/headers";
import Image from "next/image";
import { rowNumberToUppercaseLetter } from "../../utils";
import { format } from "date-fns";
export default async function PurchasesPage() {
  const cookieStore = await cookies();
  const ordersServerClient = getHcOrdersServer(cookieStore);
  const ticketsServerClient = getHcTicketsServer(cookieStore);
  const purchasesResponse =
    await ordersServerClient.api.orders.purchases.$get();

  const purchases = await purchasesResponse.json();
  const ticketIdsArrays = purchases.purchases.map(
    (purchase) => purchase.ticketIds,
  );

  const amounts = purchases.purchases.map((purchase) => purchase.amount);

  // send request for each ticketIds array to get the ticket info
  // TODO: update endpoint in backend
  const ticketInfoResponses = await Promise.all(
    ticketIdsArrays.map((ticketIds) =>
      ticketsServerClient.api.tickets["order-info-by-ticket-ids"].$query({
        json: { ticketIds, sold: true },
      }),
    ),
  );

  const ticketInfos = await Promise.all(
    ticketInfoResponses.map((response) => response.json()),
  );

  return (
    <Container>
      <Typography variant="h1">Purchases</Typography>
      <Box>
        {ticketInfos.map((ticketInfo, index) => (
          <Card key={index} sx={{ marginBottom: 2 }}>
            <CardContent>
              <Typography variant="h6">₹{amounts[index] / 100}</Typography>
              <Typography variant="body1">{ticketInfo.event.title}</Typography>
              <Typography variant="body1">
                {format(ticketInfo.event.date, "dd MMM yyyy")}
              </Typography>
              {ticketInfo.event.imageUrl ? (
                <Image
                  src={ticketInfo.event.imageUrl}
                  alt={ticketInfo.event.title}
                  width={100}
                  height={100}
                />
              ) : null}
              <Typography variant="body1">
                {ticketInfo.seatCategory.name}
              </Typography>
              <Typography variant="body1">
                {ticketInfo.tickets
                  .map(
                    (ticket) =>
                      `${rowNumberToUppercaseLetter(ticket.row)}${ticket.seatNumber}`,
                  )
                  .join(", ")}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Container>
  );
}
