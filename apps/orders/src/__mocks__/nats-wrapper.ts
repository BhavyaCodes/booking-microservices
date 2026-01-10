import { vi } from "vitest";
import type { JetStreamClient } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core/lib/core";

const mockConsume = vi.fn<(payload: { callback: (msg: any) => void }) => void>(
  ({ callback }) => {
    lastCallback = callback;
  },
);
const mockGet = vi.fn(async () => ({ consume: mockConsume }) as any);
const mockClosed = vi.fn().mockResolvedValue(undefined);
const mockDrain = vi.fn().mockResolvedValue(undefined);

let lastCallback: ((msg: any) => void) | undefined;

// Minimal shapes are asserted through unknown to keep TS strict happy while staying lightweight for tests
const mockJs = {
  consumers: {
    get: mockGet,
  },
} as unknown as JetStreamClient;

const mockNc = {
  drain: mockDrain,
  closed: mockClosed,
} as unknown as NatsConnection;

export const natsWrapper = {
  connect: vi.fn().mockResolvedValue(undefined),
  get nc() {
    return mockNc;
  },
  get js() {
    return mockJs;
  },
  __reset: () => {
    mockConsume.mockReset();
    mockGet.mockReset();
    mockClosed.mockReset();
    mockDrain.mockReset();
    natsWrapper.connect.mockReset();
    lastCallback = undefined;
  },
  __triggerMessage: async (msg: any) => {
    if (lastCallback) {
      await lastCallback(msg);
    }
  },
};
