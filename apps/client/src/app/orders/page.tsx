import { hc, OrdersAppType } from "@booking/orders/client";

import PaymentComponent from "./PaymentComponent";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

const ordersPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ clientSecret?: string }>;
}) => {
  const searchParamsResolved = await searchParams;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const ordersClient = hc<OrdersAppType>(
    "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local",
    {
      headers: {
        Cookie: cookieHeader,
        Host: "booking.dev",
      },
    },
  );
  const orderResponse = await ordersClient.api.orders.pending.$get();
  // const _data = await orderResponse.text();
  // console.log("🚀 ~ ordersPage ~ _data:", _data);
  const data = await orderResponse.json();


  


  if(data.order?.paymentIntent?.client_secret) {
    return (
      <>
      <h1>payment componenttt</h1>
      <PaymentComponent  clientSecret={data.order?.paymentIntent?.client_secret} orderId={data.order.id} />
      </>
    );
  }

  async function createPaymentIntent(formData: FormData) {
    "use server";

    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();

    const ordersClient = hc<OrdersAppType>(
      "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local",
      {
        headers: {
          Cookie: cookieHeader,
          Host: "booking.dev",
        },
      },
    );
    const paymentIntentResponse = await ordersClient.api.orders[
      "create-payment-intent"
    ][":orderId"].$post({
      param: {
        orderId: formData.get("orderId") as string,
      },
      json: {
        address: {
          city: "Client City",
          country: "US",
          line1: "123 Client St",
          postal_code: "12345",
          state: "CA",
        },
        name: "Client Name",
      }
    }).catch((err) => {
      console.error("Error creating payment intent:", err);
      throw err
    });

    const responseJson = await paymentIntentResponse.json();

    console.info("Payment Intent Response Status:", paymentIntentResponse.status);
    console.info("Payment Intent Response:", responseJson);

    if (paymentIntentResponse.status === 200) {
      const paymentIntentData = responseJson;
      console.log("Payment Intent Created:", paymentIntentData);
      const clientSecret = paymentIntentData.order.paymentIntent?.client_secret;

      if (clientSecret) {
        redirect(`/orders?clientSecret=${clientSecret}`);
      }
    }
  }

  if (!data.order) {
    return <div>No Orders</div>;
  }


  if (searchParamsResolved.clientSecret ) {
    return (
      <PaymentComponent clientSecret={searchParamsResolved.clientSecret} orderId={data.order.id} />
    );
  }

  return (
    <div>
      <h2>Orders Page</h2>

      <form action={createPaymentIntent}>
        <input type="hidden" name="orderId" value={data.order.id} />
        <pre>{JSON.stringify(data.order, null, 2)}</pre>
        <button type="submit">Pay now</button>
      </form>
    </div>
  );
};

export default ordersPage;
