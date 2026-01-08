import pino = require("pino");

const pinoLogger = pino({
  level: "trace",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },

  timestamp: pino.stdTimeFunctions.epochTime,
  serializers: {
    error: pino.stdSerializers.err,
  },
});

export { pinoLogger as pl };
