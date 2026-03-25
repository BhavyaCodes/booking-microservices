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

// Store registered handlers so tests can trigger specific subjects
const registeredHandlers = new Map<string, (msg: any) => void>();

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
    registeredHandlers.clear();
  },
  /** Trigger the raw consume callback (legacy — works with dispatcher routing) */
  __triggerMessage: async (msg: any) => {
    if (lastCallback) {
      await lastCallback(msg);
    }
  },
  /** Register a handler for a subject (called by MessageDispatcher.on via mock consume) */
  __registerHandler: (subject: string, handler: (msg: any) => void) => {
    registeredHandlers.set(subject, handler);
  },
  /** Trigger a handler for a specific subject */
  __triggerHandler: async (subject: string, msg: any) => {
    const handler = registeredHandlers.get(subject);
    if (handler) {
      await handler(msg);
    }
  },
};
