import Stripe from "stripe";
import { pl } from "../logger";


// TODO: refactor this as search api is not available in India 

// // Helper: Check if address differs from existing
// export function isAddressChanged(
//   existing: Stripe.Address | null | undefined,
//   incoming: {
//     city: string;
//     country: string;
//     line1: string;
//     line2?: string;
//     postal_code: string;
//     state: string;
//   },
// ): boolean {
//   if (!existing) return true;
//   return (
//     existing.city !== incoming.city ||
//     existing.country !== incoming.country ||
//     existing.line1 !== incoming.line1 ||
//     existing.line2 !== (incoming.line2 || "") ||
//     existing.postal_code !== incoming.postal_code ||
//     existing.state !== incoming.state
//   );
// }

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
  // const customers = await stripe.customers.search({
  //   query: `metadata['userId']:'${userId}'`,
  // });

  // if (customers.data.length === 0) {
  //   const customer = await stripe.customers.create({
  //     address,
  //     name,
  //     metadata: { userId },
  //   });
  //   pl.debug(customer, "Created new Stripe Customer");
  //   return customer.id;
  // }

  // if (customers.data.length > 1) {
  //   pl.warn(`Multiple Stripe customers found for user ${userId}`);
  // }

  // const customerId = customers.data[0].id;
  // const existingAddress = customers.data[0].address;
  // const existingName = customers.data[0].name;

  // if (isAddressChanged(existingAddress, address) || existingName !== name) {
    // await stripe.customers.update(customerId, { address, name });
    // pl.debug({ customerId }, "Updated Stripe Customer");
  // }

  const customer = await stripe.customers.create({
    address,
    name,
    metadata: { userId },
  });
  pl.debug(customer, "Created new Stripe Customer");
  const customerId = customer.id;

  return customerId;
}
