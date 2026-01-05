import {
  pino,
  stdSerializers,
  stdTimeFunctions,
  type LoggerOptions,
} from "pino";

const getPinoLogger = (level: LoggerOptions["level"]) => {
  return pino({
    level,
    transport: {
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
};

export { getPinoLogger };
