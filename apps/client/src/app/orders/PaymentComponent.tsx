"use client";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import CheckoutForm from "./CheckoutForm";
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const PaymentComponent = ({ clientSecret }: { clientSecret: string }) => {
  const [paymentStatus, setPaymentStatus] = useState<
    "notSubmitted" | "success" | "failed"
  >("notSubmitted");

  return (
    <div className="App">
      <h2>Complete your payment</h2>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "night",
          },
        }}
      >
        {clientSecret && paymentStatus === "notSubmitted" && (
          <CheckoutForm setPaymentStatus={setPaymentStatus} />
        )}
      </Elements>
    </div>
  );
};

export default PaymentComponent;
