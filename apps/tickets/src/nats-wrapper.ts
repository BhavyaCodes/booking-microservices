import { connect, JetStreamClient, NatsConnection, StringCodec } from "nats";

class NatsWrapper {
  private _nc?: NatsConnection;
  private _js?: JetStreamClient;

  readonly sc = StringCodec();

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

  // name - identifier for this NATS client (also used as the initial stream name, e.g. "tickets-publisher"
  async connect(
    server: string,
    name = process.env.POD_NAME || "default-nats-client-tickets",
  ) {
    this._nc = await connect({ servers: server, name: name });
    this._js = this._nc.jetstream();
  }
}

export const natsWrapper = new NatsWrapper();
