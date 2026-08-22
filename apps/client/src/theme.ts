"use client";
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  typography: {
    fontFamily:
      "var(--font-inter), Inter, system-ui, -apple-system, sans-serif",
    h1: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    h2: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    h3: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    h4: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    h5: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    h6: {
      fontWeight: 600,
      letterSpacing: "0.01em",
    },
    body1: {
      fontWeight: 400,
    },
    body2: {
      fontWeight: 400,
    },
  },
  shape: {
    borderRadius: 14,
  },
  // components: {
  //   MuiCssBaseline: {
  //     styleOverrides: {
  //       body: {
  //         backgroundColor: "#0a0e1a",
  //         color: "rgba(232, 240, 255, 0.96)",
  //       },
  //     },
  //   },
  //   MuiPaper: {
  //     styleOverrides: {
  //       root: {
  //         backgroundImage: "none",
  //         backgroundColor: "rgba(15, 21, 36, 0.6)",
  //         backdropFilter: "blur(16px)",
  //         WebkitBackdropFilter: "blur(16px)",
  //         border: "1px solid rgba(125, 211, 252, 0.1)",
  //         boxShadow: "0 0 30px rgba(125, 211, 252, 0.05)",
  //       },
  //     },
  //   },
  //   MuiCard: {
  //     styleOverrides: {
  //       root: {
  //         backgroundColor: "rgba(15, 21, 36, 0.6)",
  //         backdropFilter: "blur(16px)",
  //         WebkitBackdropFilter: "blur(16px)",
  //         border: "1px solid rgba(125, 211, 252, 0.1)",
  //         boxShadow: "0 0 30px rgba(125, 211, 252, 0.05)",
  //       },
  //     },
  //   },
  //   MuiButton: {
  //     styleOverrides: {
  //       root: {
  //         borderRadius: 12,
  //         textTransform: "none",
  //         fontWeight: 600,
  //         border: "1px solid rgba(125, 211, 252, 0.15)",
  //         boxShadow: "0 0 20px rgba(125, 211, 252, 0.04)",
  //       },
  //     },
  //     variants: [
  //       {
  //         props: { variant: "contained", color: "primary" },
  //         style: {
  //           backgroundColor: "rgba(125, 211, 252, 0.22)",
  //           color: "rgba(232, 240, 255, 0.96)",
  //           "&:hover": {
  //             backgroundColor: "rgba(125, 211, 252, 0.32)",
  //             boxShadow: "0 0 30px rgba(125, 211, 252, 0.08)",
  //           },
  //         },
  //       },
  //       {
  //         props: { variant: "outlined", color: "primary" },
  //         style: {
  //           borderColor: "rgba(125, 211, 252, 0.15)",
  //           backgroundColor: "rgba(15, 21, 36, 0.6)",
  //           "&:hover": {
  //             borderColor: "rgba(125, 211, 252, 0.28)",
  //             backgroundColor: "rgba(125, 211, 252, 0.12)",
  //           },
  //         },
  //       },
  //     ],
  //   },
  //   MuiCardContent: {
  //     styleOverrides: {
  //       root: {
  //         "&:last-child": {
  //           paddingBottom: 16,
  //         },
  //       },
  //     },
  //   },
  //   MuiTextField: {
  //     defaultProps: {
  //       variant: "outlined",
  //     },
  //   },
  //   MuiOutlinedInput: {
  //     styleOverrides: {
  //       root: {
  //         backgroundColor: "rgba(15, 21, 36, 0.6)",
  //         backdropFilter: "blur(16px)",
  //         WebkitBackdropFilter: "blur(16px)",
  //         "& .MuiOutlinedInput-notchedOutline": {
  //           borderColor: "rgba(255, 255, 255, 0.1)",
  //         },
  //         "&:hover .MuiOutlinedInput-notchedOutline": {
  //           borderColor: "rgba(125, 211, 252, 0.15)",
  //         },
  //         "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
  //           borderColor: "rgba(125, 211, 252, 0.35)",
  //           boxShadow: "0 0 24px rgba(125, 211, 252, 0.1)",
  //         },
  //       },
  //     },
  //   },
  //   MuiAppBar: {
  //     styleOverrides: {
  //       root: {
  //         backgroundColor: "rgba(15, 21, 36, 0.75)",
  //         backdropFilter: "blur(24px)",
  //         WebkitBackdropFilter: "blur(24px)",
  //         borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  //         boxShadow: "none",
  //       },
  //     },
  //   },
  // },
});

export default theme;
