import "server-only";
import { hc, TicketsAppType } from "@booking/tickets/client";
import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { OrdersAppType } from "@booking/orders/client";

export const getHcTicketsServer = (cookieStore: ReadonlyRequestCookies) => {
  return hc<TicketsAppType>(process.env.INTERNAL_BASE_URL!, {
    headers: {
      Cookie: cookieStore.toString(),
      Host: process.env.INTERNAL_HOST!,
    },
  });
};

export const getHcOrdersServer = (cookieStore: ReadonlyRequestCookies) => {
  return hc<OrdersAppType>(process.env.INTERNAL_BASE_URL!, {
    headers: {
      Cookie: cookieStore.toString(),
      Host: process.env.INTERNAL_HOST!,
    },
  });
};
