import { getPinoLogger } from "@booking/common";

const pinoLogger = getPinoLogger("trace");

export { pinoLogger as pl };
