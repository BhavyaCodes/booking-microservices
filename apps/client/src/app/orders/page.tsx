import { hc, OrdersAppType } from "@booking/orders/client";

import PaymentComponent from "./PaymentComponent";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getHcOrdersServer, getHcTicketsServer } from "@/app/lib/hc-server";
import {
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  Container,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { rowNumberToUppercaseLetter } from "../../utils";
import Image from "next/image";

const ordersPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ clientSecret?: string }>;
}) => {
  const searchParamsResolved = await searchParams;
  const cookieStore = await cookies();

  // const ordersClient = hc<OrdersAppType>(
  //   "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local",
  //   {
  //     headers: {
  //       Cookie: cookieHeader,
  //       Host: "booking.dev",
  //     },
  //   },
  // );

  const ordersClient = getHcOrdersServer(cookieStore);
  const orderResponse = await ordersClient.api.orders.pending.$get();
  const orderData = await orderResponse.json();

  const ticketsClient = getHcTicketsServer(cookieStore);

  if (!orderData.order) {
    return <div>No Orders</div>;
  }

  const ticketResponse = await ticketsClient.api.tickets[
    "order-info-by-ticket-ids"
  ].$query({
    json: {
      ticketIds: orderData.order?.ticketIds,
      sold: false,
    },
  });

  const ticketData = await ticketResponse.json();

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
    ][":orderId"]
      .$post({
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
        },
      })
      .catch((err) => {
        console.error("Error creating payment intent:", err);
        throw err;
      });

    const responseJson = await paymentIntentResponse.json();

    console.info(
      "Payment Intent Response Status:",
      paymentIntentResponse.status,
    );
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

  if (searchParamsResolved.clientSecret) {
    return (
      <PaymentComponent
        clientSecret={searchParamsResolved.clientSecret}
        orderId={orderData.order.id}
      />
    );
  }

  return (
    <Container>
      <Card>
        <CardContent>
          <Typography variant="h4">Orders</Typography>
          <Typography variant="body1">
            Order ID: {orderData.order.id}
          </Typography>
          {ticketData.event.imageUrl ? (
            <Image
              src={ticketData.event.imageUrl}
              alt={ticketData.event.title}
              width={100}
              height={100}
            />
          ) : null}
          <Typography variant="body1">
            Order Status: {orderData.order.status}
          </Typography>
          <Typography variant="body1">
            Order Amount: ₹{orderData.order.amount / 100}
          </Typography>
          <Typography variant="body1">
            Order Created At:{" "}
            {format(orderData.order.createdAt, "HH:mm:ss dd MMM")}
          </Typography>
          {ticketData.tickets
            .map(
              (ticket) =>
                `${rowNumberToUppercaseLetter(ticket.row)}${ticket.seatNumber}`,
            )
            .join(", ")}
        </CardContent>
        <CardActions>
          <form action={createPaymentIntent}>
            <input type="hidden" name="orderId" value={orderData.order.id} />
            <Button variant="contained" color="primary" type="submit">
              Pay now
            </Button>
          </form>
        </CardActions>
      </Card>
    </Container>
  );

  // if (orderData.order?.paymentIntent?.client_secret) {
  //   return (
  //     <>
  //       <h1>payment componenttt</h1>
  //       <PaymentComponent
  //         clientSecret={data.order?.paymentIntent?.client_secret}
  //         orderId={data.order.id}
  //       />
  //     </>
  //   );
  // }

  // async function createPaymentIntent(formData: FormData) {
  //   "use server";

  //   const cookieStore = await cookies();
  //   const cookieHeader = cookieStore.toString();

  //   const ordersClient = hc<OrdersAppType>(
  //     "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local",
  //     {
  //       headers: {
  //         Cookie: cookieHeader,
  //         Host: "booking.dev",
  //       },
  //     },
  //   );
  //   const paymentIntentResponse = await ordersClient.api.orders[
  //     "create-payment-intent"
  //   ][":orderId"]
  //     .$post({
  //       param: {
  //         orderId: formData.get("orderId") as string,
  //       },
  //       json: {
  //         address: {
  //           city: "Client City",
  //           country: "US",
  //           line1: "123 Client St",
  //           postal_code: "12345",
  //           state: "CA",
  //         },
  //         name: "Client Name",
  //       },
  //     })
  //     .catch((err) => {
  //       console.error("Error creating payment intent:", err);
  //       throw err;
  //     });

  //   const responseJson = await paymentIntentResponse.json();

  //   console.info(
  //     "Payment Intent Response Status:",
  //     paymentIntentResponse.status,
  //   );
  //   console.info("Payment Intent Response:", responseJson);

  //   if (paymentIntentResponse.status === 200) {
  //     const paymentIntentData = responseJson;
  //     console.log("Payment Intent Created:", paymentIntentData);
  //     const clientSecret = paymentIntentData.order.paymentIntent?.client_secret;

  //     if (clientSecret) {
  //       redirect(`/orders?clientSecret=${clientSecret}`);
  //     }
  //   }
  // }

  // if (searchParamsResolved.clientSecret) {
  //   return (
  //     <PaymentComponent
  //       clientSecret={searchParamsResolved.clientSecret}
  //       orderId={data.order.id}
  //     />
  //   );
  // }

  // return (
  //   <div>
  //     <h2>Orders Page</h2>

  //     <form action={createPaymentIntent}>
  //       <input type="hidden" name="orderId" value={orderData.order.id} />
  //       {/* <pre>{JSON.stringify(data.order, null, 2)}</pre> */}
  //       <button type="submit">Pay now</button>
  //     </form>
  //   </div>
  // );
};

export default ordersPage;
