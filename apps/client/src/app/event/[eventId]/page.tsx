"use server";

import { cookies } from "next/headers";
import { getHcTicketsServer } from "@/app/lib/hc-server";
import { Container, Typography } from "@mui/material";
import Image from "next/image";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import { EventPricing } from "./EventPricing";
import { Suspense } from "react";

const EventPage = async ({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) => {
  const { eventId } = await params;
  const cookieStore = await cookies();
  const ticketsClient = getHcTicketsServer(cookieStore);

  const eventResponse = await ticketsClient.api.tickets.events[":eventId"].$get(
    {
      param: {
        eventId,
      },
    },
  );

  // @ts-expect-error - error status is not typed
  if (eventResponse.status == 404) {
    notFound();
  }

  const event = await eventResponse.json();

  return (
    <Container>
      <Typography variant="h1">{event.title}</Typography>
      {event.imageUrl && (
        <Image
          src={event.imageUrl}
          alt={event.title}
          width={100}
          height={100}
        />
      )}

      <Typography variant="body1">{event.desc}</Typography>
      <Typography variant="body1">
        {format(event.date, "dd MMM yyyy")}
      </Typography>
      <Suspense fallback={<div>Loading...</div>}>
        <EventPricing eventId={eventId} />
      </Suspense>
    </Container>
  );
};

export default EventPage;
