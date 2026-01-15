// import { BaseListener, Subjects, TicketCreatedEvent } from "@booking/common";
// import { JsMsg } from "@nats-io/jetstream/lib/jsmsg";
// import { pl } from "../logger";
// import { db } from "../db";
// import { ticketsTable } from "../db/schema";

// export class TicketCreatedListener extends BaseListener<TicketCreatedEvent> {
//   readonly subject = Subjects.TicketsCreated;
//   readonly stream = "booking";
//   readonly durableName = "orders-service-durable";

//   async onMessage(msg: JsMsg) {
//     pl.trace(
//       { podName: process.env.POD_NAME, message: msg.json() },
//       "TicketCreated event received",
//     );

//     const data = msg.json<TicketCreatedEvent["data"]>();
//     pl.trace({ data }, "TicketCreated event data");

//     const dbData = data.map((ticket) => {
//       return {
//         id: ticket.id,
//         seatCategoryId: ticket.seatCategoryId,
//         price: ticket.price,
//         date: new Date(ticket.date),
//       };
//     });

//     try {
//       const result = await db
//         .insert(ticketsTable)
//         .values(dbData)
//         .onConflictDoNothing({
//           target: ticketsTable.id,
//         });

//       pl.debug(
//         { result },
//         `Inserted ${result.rowCount} tickets from TicketCreated event`,
//       );
//       msg.ack();
//     } catch (error) {
//       pl.error(error, "Failed to insert tickets from TicketCreated event");
//       const deliveryCount = msg.info?.deliveryCount ?? 0;
//       // TODO: add error queue
//       const MAX_REDELIVERIES = 5;
//       if (deliveryCount >= MAX_REDELIVERIES) {
//         pl.error(
//           { deliveryCount: deliveryCount },
//           "Max redeliveries reached for TicketCreated event, acknowledging message to prevent further retries",
//         );
//         msg.ack();
//       } else {
//         msg.nak(5000); // wait 5 seconds before redelivery
//       }
//     }
//   }
// }

export {};
