const EventPage = async ({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) => {
  const { eventId } = await params;

  return <div>EventPage {eventId}</div>;
};

export default EventPage;
