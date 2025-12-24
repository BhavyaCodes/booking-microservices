import { connect, JetStreamClient, NatsConnection } from "nats";

class NatsWrapper {
  private _nc?: NatsConnection;
  private _js?: JetStreamClient;
  private _stream?: string;

  get nc() {
    if (!this._nc) {
      throw new Error("Cannot access NATS client before connecting");
    }
    return this._nc;
  }

  get js() {
    if (!this._js) {
      throw new Error("Cannot access NATS JetStream before connecting");
    }
    return this._js;
  }

  get stream() {
    if (!this._stream) {
      throw new Error("Cannot access NATS stream before connecting");
    }
    return this._stream;
  }

  // name - "booking"
  async connect(server: string, name: string) {
    this._stream = name;
    this._nc = await connect({ servers: server, name: name });
    this._js = this._nc.jetstream();
  }
}

export const natsWrapper = new NatsWrapper();
