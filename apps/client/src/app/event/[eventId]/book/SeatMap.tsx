"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import { hcTicketsClient } from "@/app/lib/hc-client";
import { Seat, type SeatStatus } from "./Seat";

const MAX_SEATS = 10;

export type Ticket = {
  id: string;
  seatCategoryId: string;
  eventId: string;
  row: number;
  seatNumber: number;
  userId: string | null;
  sold: boolean;
  version: number;
};

export type SeatCategoryWithTickets = {
  id: string;
  eventId: string;
  startRow: number;
  endRow: number;
  price: number;
  seatsPerRow: number;
  version: number;
  name: string;
  tickets: Ticket[];
};

type SeatMapProps = {
  categories: SeatCategoryWithTickets[];
};

function isAvailable(ticket: Ticket): boolean {
  return ticket.userId == null;
}

function groupTicketsByRow(tickets: Ticket[]): Map<number, Ticket[]> {
  const byRow = new Map<number, Ticket[]>();
  for (const ticket of tickets) {
    const row = byRow.get(ticket.row) ?? [];
    row.push(ticket);
    byRow.set(ticket.row, row);
  }
  for (const seats of byRow.values()) {
    seats.sort((a, b) => a.seatNumber - b.seatNumber);
  }
  return byRow;
}

export const SeatMap = ({ categories }: SeatMapProps) => {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  console.log(selectedIds);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriesWithRows = useMemo(
    () =>
      categories.map((category) => ({
        category,
        rows: groupTicketsByRow(category.tickets),
      })),
    [categories],
  );

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedCount = selectedIds.size;
  const totalPaise =
    selectedCategory && selectedCount > 0
      ? selectedCount * selectedCategory.price
      : 0;

  const seatStatus = (ticket: Ticket): SeatStatus => {
    if (!isAvailable(ticket)) return "unavailable";
    if (selectedIds.has(ticket.id)) return "selected";
    return "available";
  };

  const toggleSeat = (ticket: Ticket, categoryId: string) => {
    if (!isAvailable(ticket)) return;
    setError(null);

    if (selectedCategoryId !== null && selectedCategoryId !== categoryId) {
      setSelectedCategoryId(categoryId);
      setSelectedIds(new Set([ticket.id]));
      return;
    }

    if (selectedIds.has(ticket.id)) {
      const next = new Set(selectedIds);
      next.delete(ticket.id);
      setSelectedIds(next);
      if (next.size === 0) {
        setSelectedCategoryId(null);
      }
      return;
    }

    if (selectedIds.size >= MAX_SEATS) {
      setError(`You can select at most ${MAX_SEATS} seats`);
      return;
    }

    setSelectedCategoryId(categoryId);
    setSelectedIds(new Set(selectedIds).add(ticket.id));
  };

  const handlePay = async () => {
    if (!selectedCategoryId || selectedIds.size === 0) return;

    setIsReserving(true);
    setError(null);

    try {
      const response = await hcTicketsClient.api.tickets["seat-categories"][
        ":seatCategoryId"
      ].tickets.reserve.$post({
        param: { seatCategoryId: selectedCategoryId },
        json: { ticketIds: Array.from(selectedIds) },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? "Failed to reserve seats. Please try again.");
        return;
      }

      router.push("/orders");
    } catch {
      setError("Failed to reserve seats. Please try again.");
    } finally {
      setIsReserving(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 64px)",
        bgcolor: "#fafafa",
        pb: selectedCount > 0 ? 10 : 4,
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          px: 2,
          pt: 3,
          overflowX: "auto",
        }}
      >
        {[...categoriesWithRows].reverse().map(({ category, rows }) => (
          <Box
            key={category.id}
            sx={{
              width: "100%",
              maxWidth: "fit-content",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mb: 0.5,
              }}
            >
              <Box sx={{ flex: 1, height: "1px", bgcolor: "#bdbdbd" }} />
              <Typography
                component="h2"
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: "#616161",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                }}
              >
                ₹{category.price / 100} {category.name}
              </Typography>
              <Box sx={{ flex: 1, height: "1px", bgcolor: "#bdbdbd" }} />
            </Box>

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.75,
                alignItems: "center",
              }}
            >
              {[...rows.entries()]
                .sort(([a], [b]) => b - a)
                .map(([rowNum, seats]) => (
                  <Box
                    key={rowNum}
                    sx={{
                      display: "flex",
                      gap: 0.6,
                      alignItems: "center",
                    }}
                  >
                    {seats.map((ticket) => (
                      <Seat
                        key={ticket.id}
                        seatNumber={ticket.seatNumber}
                        status={seatStatus(ticket)}
                        onClick={() => toggleSeat(ticket, category.id)}
                      />
                    ))}
                  </Box>
                ))}
            </Box>
          </Box>
        ))}

        <Box
          sx={{
            mt: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.5,
            width: "100%",
            maxWidth: 420,
          }}
        >
          <Box
            sx={{
              width: "85%",
              height: 28,
              bgcolor: "#90caf9",
              backgroundImage:
                "linear-gradient(180deg, #bbdefb 0%, #90caf9 55%, #e3f2fd 100%)",
              clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
              boxShadow: "0 2px 6px rgba(144, 202, 249, 0.45)",
            }}
          />
          <Typography
            sx={{
              fontSize: 13,
              color: "#9e9e9e",
              fontWeight: 500,
            }}
          >
            All eyes this way please
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            position: "fixed",
            bottom: selectedCount > 0 ? 80 : 16,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 420,
            width: "calc(100% - 32px)",
            zIndex: 1200,
          }}
        >
          {error}
        </Alert>
      )}

      {selectedCount > 0 && selectedCategory && (
        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            bgcolor: "#fff",
            borderTop: "1px solid #e0e0e0",
            px: 2,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            zIndex: 1100,
            boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 15 }}>
              {selectedCount} seat{selectedCount === 1 ? "" : "s"} · ₹
              {totalPaise / 100}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#757575" }}>
              {selectedCategory.name}
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            disabled={isReserving}
            onClick={handlePay}
            sx={{ minWidth: 120, fontWeight: 700 }}
          >
            {isReserving ? (
              <CircularProgress size={22} color="inherit" />
            ) : (
              "Pay"
            )}
          </Button>
        </Box>
      )}
    </Box>
  );
};
