import { jetstream, JetStreamClient } from "@nats-io/jetstream";
import { NatsConnection } from "@nats-io/nats-core/lib/core";
import { connect } from "@nats-io/transport-node";
import { pl } from "./logger";

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

  // name - identifier for this NATS client (also used as the initial stream name, e.g. "tickets-publisher"
  async connect(
    server: string,
    name = process.env.POD_NAME || "default-nats-client-tickets",
  ) {
    const maxRetries = 10;
    const baseDelay = 1000; // 1 second
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this._nc = await connect({ servers: server, name: name });
        this._js = jetstream(this._nc);
        return;
      } catch (error) {
        lastError = error;
        const delay = baseDelay * Math.pow(2, attempt);
        pl.error(
          error,
          `NATS connection attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

export const natsWrapper = new NatsWrapper();
