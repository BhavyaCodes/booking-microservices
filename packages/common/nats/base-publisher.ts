import { Subjects } from "./subjects";
import { StringCodec, type JetStreamClient, type PubAck } from "nats";

interface Event {
  subject: Subjects;
  data: Record<string, any>;
}

export abstract class BasePublisher<T extends Event> {
  abstract subject: Subjects;
  protected js: JetStreamClient;
  readonly sc = StringCodec();

  constructor(js: JetStreamClient) {
    this.js = js;
  }

  async publish(data: T["data"]): Promise<PubAck> {
    const dataString = JSON.stringify(data);
    const pa = await this.js.publish(this.subject, this.sc.encode(dataString));
    return pa;
  }
}
