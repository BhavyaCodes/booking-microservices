import { AckPolicy, connect, ReplayPolicy } from "nats";

import type { Subject } from "./publisher";
const server = "http://localhost:4222";

async function main() {
  const nc = await connect({ servers: server, name: "listener-client" });

  const js = nc.jetstream();
  const subject: Subject = "tickets.order-created";
  const jsm = await nc.jetstreamManager();

  // const createdConsumer = await jsm.consumers.add("booking", {
  //   // name: "order-service-consumer",
  //   durable_name: "order-service-durable",
  //   filter_subject: subject,
  //   replay_policy: ReplayPolicy.Instant,
  //   ack_policy: AckPolicy.Explicit,
  // });
  // console.log("🚀 ~ main ~ createdConsumer:", createdConsumer);

  // const consumers = await jsm.consumers.list("booking");
  // for await (const consumerInfo of consumers) {
  //   console.log("🚀 ~ main ~ consumerInfo:", consumerInfo);
  // }

  const consumer = await js.consumers.get("booking", "tickets-service-durable");

  consumer.consume({
    callback: (jsMsg) => {
      console.log(`Received message [${jsMsg.seq}]: ${jsMsg.data}`);
      jsMsg.ack();
    },
  });
  // nc.subscribe(subject, {
  //   queue: "order-service-queue",
  // 	callback: (err, msg) => {
  // 		if (err) {
  // 			console.error("Error receiving message:", err);
  // 			return;
  // 		}
  // 		console.log(`Received a message on subject ${msg.subject}: ${msg.data}`);
  // 		msg.ack
  // 	}
  // });
  // await nc.close();
}

main().catch((err) => {
  console.error("Error in listener:", err);
});
