import { Subjects } from "./subjects";
import { Consumer, JetStreamClient, JsMsg } from "nats";
import { StringCodec } from "nats";
interface Event {
  subject: Subjects;
  data: any;
}

export abstract class BaseListener<T extends Event> {
  abstract subject: T["subject"];
  abstract onMessage(msg: JsMsg): void;
  abstract stream: string;
  protected ackWait = 5 * 1000;

  protected js: JetStreamClient;

  constructor(js: JetStreamClient) {
    this.js = js;
  }

  async listen() {
    const sc = StringCodec();
    const consumer = await this.js.consumers.get(
      this.stream,
      "tickets-service-durable",
    );
    consumer.consume({
      callback: (msg: JsMsg) => {
        // console.log(
        //   // `Message received: ${this.subject} / ${msg.seq} / ${JSON.stringify(JSON.parse(sc.decode(msg.data)), null, 2)}`,
        //   `Message received: ${this.subject} / ${msg.seq} `,
        // );
        this.onMessage(msg);
      },
    });
  }
}
