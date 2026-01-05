import { pino, stdSerializers, stdTimeFunctions } from "pino";

const pinoLogger = pino({
  level: "trace",
  transport: {
    // target: "hono-pino/debug-log",
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },

  timestamp: stdTimeFunctions.epochTime,
  serializers: {
    error: stdSerializers.err,
  },
});

export { pinoLogger as pl };
