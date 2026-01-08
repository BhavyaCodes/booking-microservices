import { jetstream, JetStreamClient } from "@nats-io/jetstream";
import { NatsConnection } from "@nats-io/nats-core/lib/core";
import { connect } from "@nats-io/transport-node";

class NatsWrapper {
  private _nc?: NatsConnection;
  private _js?: JetStreamClient;

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

  // name - identifier for this NATS client (also used as the initial stream name, e.g. "orders-publisher"
  async connect(
    server: string,
    name = process.env.POD_NAME || "default-nats-client-orders",
  ) {
    this._nc = await connect({ servers: server, name: name });
    this._js = jetstream(this._nc);
  }
}

export const natsWrapper = new NatsWrapper();
