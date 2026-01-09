import type { JetStreamClient, JsMsg } from "@nats-io/jetstream";
import { Subjects } from "./subjects";

interface Event {
  subject: Subjects;
  data: any;
}

export abstract class BaseListener<T extends Event> {
  abstract subject: T["subject"];
  abstract onMessage(msg: JsMsg): void;
  abstract stream: string;
  abstract durableName: string;
  protected js: JetStreamClient;

  constructor(js: JetStreamClient) {
    this.js = js;
  }

  async listen() {
    const consumer = await this.js.consumers.get(this.stream, this.durableName);
    consumer.consume({
      callback: (msg: JsMsg) => {
        this.onMessage(msg);
      },
    });
  }
}
