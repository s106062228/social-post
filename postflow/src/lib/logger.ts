import pino, { type Logger } from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger: Logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    ...(!isDev && {
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }),
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      })
    : undefined
);

export const dbLogger = logger.child({ context: "db" });
export const apiLogger = logger.child({ context: "api" });
export const workerLogger = logger.child({ context: "worker" });
export const oauthLogger = logger.child({ context: "oauth" });
export const webhookLogger = logger.child({ context: "webhook" });
export const publishLogger = logger.child({ context: "publish" });

export default logger;
