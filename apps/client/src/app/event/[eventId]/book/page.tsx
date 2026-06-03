import { getHcTicketsServer } from "@/app/lib/hc-server";
import { cookies } from "next/headers";

const BookPage = async ({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) => {
  const { eventId } = await params;

  return <div>Booking for event {eventId}</div>;
};

export default BookPage;
