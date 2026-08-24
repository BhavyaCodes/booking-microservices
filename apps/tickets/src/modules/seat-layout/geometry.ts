export function rowsOverlap(
  startRow: number,
  endRow: number,
  category: { startRow: number; endRow: number },
): boolean {
  if (startRow >= category.startRow && startRow <= category.endRow) {
    return true;
  }

  if (endRow >= category.startRow && endRow <= category.endRow) {
    return true;
  }

  if (startRow <= category.startRow && endRow >= category.endRow) {
    return true;
  }

  return false;
}

export function buildTicketGrid({
  seatCategoryId,
  eventId,
  startRow,
  endRow,
  seatsPerRow,
}: {
  seatCategoryId: string;
  eventId: string;
  startRow: number;
  endRow: number;
  seatsPerRow: number;
}) {
  const tickets: {
    seatCategoryId: string;
    row: number;
    seatNumber: number;
    eventId: string;
  }[] = [];

  for (let row = startRow; row <= endRow; row++) {
    for (let seat = 1; seat <= seatsPerRow; seat++) {
      tickets.push({
        seatCategoryId,
        row,
        seatNumber: seat,
        eventId,
      });
    }
  }

  return tickets;
}
