"use client";

import { Box } from "@mui/material";

export type SeatStatus = "available" | "unavailable" | "selected";

type SeatProps = {
  seatNumber: number;
  status: SeatStatus;
  onClick?: () => void;
};

const seatSx = {
  available: {
    bgcolor: "#fff",
    border: "1.5px solid #4caf50",
    color: "#424242",
    cursor: "pointer",
    "&:hover": {
      bgcolor: "#f1f8e9",
    },
  },
  unavailable: {
    bgcolor: "#e0e0e0",
    border: "1.5px solid transparent",
    color: "#fff",
    cursor: "default",
  },
  selected: {
    bgcolor: "#ffc107",
    border: "1.5px solid #4caf50",
    color: "#424242",
    cursor: "pointer",
    boxShadow: "0 0 6px rgba(255, 193, 7, 0.65)",
  },
} as const;

export const Seat = ({ seatNumber, status, onClick }: SeatProps) => {
  const label = String(seatNumber).padStart(2, "0");

  return (
    <Box
      component="button"
      type="button"
      disabled={status === "unavailable"}
      onClick={onClick}
      aria-label={`Seat ${label}${status === "selected" ? ", selected" : ""}`}
      aria-pressed={status === "selected"}
      sx={{
        width: 32,
        height: 28,
        borderRadius: "6px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "inherit",
        lineHeight: 1,
        p: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background-color 0.15s ease, box-shadow 0.15s ease",
        ...seatSx[status],
      }}
    >
      {label}
    </Box>
  );
};
