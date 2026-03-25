import Stripe from "stripe";
import { pl } from "../logger";

export const stripe = new Stripe(process.env.ORDERS_STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

// Helper: Upsert Stripe customer (returns customer ID)
export async function upsertStripeCustomer(
  userId: string,
  address: {
    city: string;
    country: string;
    line1: string;
    line2?: string;
    postal_code: string;
    state: string;
  },
  name: string,
  stripe: Stripe,
): Promise<string> {
  const customer = await stripe.customers.create({
    address,
    name,
    metadata: { userId },
  });
  pl.debug(customer, "Created new Stripe Customer");
  const customerId = customer.id;

  return customerId;
}
