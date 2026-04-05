import { inspect } from "util";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? "info";

function log(
  level: LogLevel,
  context: string,
  message: string,
  meta?: unknown
): void {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...(meta !== undefined
      ? { meta: typeof meta === "object" ? meta : inspect(meta) }
      : {}),
  };

  const line = JSON.stringify(entry);

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (context: string, message: string, meta?: unknown) =>
    log("debug", context, message, meta),
  info: (context: string, message: string, meta?: unknown) =>
    log("info", context, message, meta),
  warn: (context: string, message: string, meta?: unknown) =>
    log("warn", context, message, meta),
  error: (context: string, message: string, meta?: unknown) =>
    log("error", context, message, meta),
};
