import type { JetStreamClient, JsMsg } from "@nats-io/jetstream";
import type { Subjects } from "./subjects";

export type MessageHandler = (msg: JsMsg) => void | Promise<void>;

export class MessageDispatcher {
  private handlers = new Map<string, MessageHandler>();
  private js: JetStreamClient;
  private stream: string;
  private durableName: string;

  constructor(js: JetStreamClient, stream: string, durableName: string) {
    this.js = js;
    this.stream = stream;
    this.durableName = durableName;
  }

  on(subject: Subjects, handler: MessageHandler): this {
    this.handlers.set(subject, handler);
    return this;
  }

  async listen() {
    const consumer = await this.js.consumers.get(this.stream, this.durableName);
    console.info(
      {
        podName: process.env.POD_NAME,
        stream: this.stream,
        durableName: this.durableName,
        subjects: [...this.handlers.keys()],
      },
      "Listening for events",
    );

    consumer.consume({
      callback: (msg: JsMsg) => {
        const handler = this.handlers.get(msg.subject);
        if (handler) {
          handler(msg);
        } else {
          console.warn(
            { subject: msg.subject, stream: this.stream },
            "No handler registered for subject, acking to prevent redelivery",
          );
          msg.ack();
        }
      },
    });
  }
}
