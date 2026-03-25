"use client";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import CheckoutForm from "./CheckoutForm";
import { hc } from "@booking/auth/client";
import { OrdersAppType } from "@booking/orders/client";
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

const PaymentComponent = ({
  clientSecret,
  orderId,
}: {
  clientSecret: string;
  orderId: string;
}) => {
  const [paymentStatus, setPaymentStatus] = useState<
    "notSubmitted" | "success" | "failed"
  >("notSubmitted");

  const [isCancelling, setIsCancelling] = useState(false);
  // const cookieHeader = cookieStore.toString();
  const [isCancelled, setIsCancelled] = useState(false);

  const ordersClient = hc<OrdersAppType>(
    "https://booking.dev",
    {
      headers: {
        // Cookie: cookieHeader,
        Host: "booking.dev",
      },
    },
  );

  const handleCancelOrder = async () => {
    setIsCancelling(true);
    await ordersClient.api.orders[":orderId"].cancel
      .$post({
        param: {
          orderId,
        },
      })
      .then(() => {
        setIsCancelled(true);
      })
      .finally(() => {
        setIsCancelling(false);
      });
  };

  return (
    <div className="App">
      <h2>Complete your payment</h2>
      {isCancelled ? (
        <p>Order Cancelled</p>
      ) : (
        <>
          <p>Order ID: {orderId}</p>
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
        </>
      )}

      <button type="button" onClick={handleCancelOrder}>
        cancel order
      </button>
    </div>
  );
};

export default PaymentComponent;
