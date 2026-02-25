import { OrderExpiredEvent, Subjects } from "@booking/common";
import { natsWrapper } from "../nats-wrapper";

export const orderExpiredPublisher = async (
  data: OrderExpiredEvent["data"],
) => {
  return natsWrapper.js.publish(Subjects.OrderExpired, JSON.stringify(data));
};
