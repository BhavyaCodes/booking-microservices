import { Subjects } from "./subjects";
import type { JetStreamClient, JsMsg } from "nats";

interface Event {
  subject: Subjects;
  data: any;
}

export abstract class BaseListener<T extends Event> {
  abstract subject: T["subject"];
  abstract onMessage(msg: JsMsg): void;
  abstract stream: string;

  protected js: JetStreamClient;

  constructor(js: JetStreamClient) {
    this.js = js;
  }

  async listen() {
    const consumer = await this.js.consumers.get(
      this.stream,
      "tickets-service-durable",
    );
    consumer.consume({
      callback: (msg: JsMsg) => {
        this.onMessage(msg);
      },
    });
  }
}
