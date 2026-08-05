/**
 * Structured JSON logger. Emite uma linha por evento com metadados
 * de correlação. Funciona no worker SSR (console.log) e no browser.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  companyId?: string;
  module?: string;
  route?: string;
  provider?: string;
  flag?: string;
  permission?: string;
  latencyMs?: number;
  errorCode?: string;
  browser?: string;
  device?: string;
  [key: string]: unknown;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold(): LogLevel {
  const env = typeof process !== "undefined" ? process.env?.LOG_LEVEL : undefined;
  if (env && env in LEVEL_RANK) return env as LogLevel;
  return "info";
}

function emit(level: LogLevel, message: string, fields: LogFields = {}) {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentThreshold()]) return;
  const line = { time: new Date().toISOString(), level, msg: message, ...fields };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  child: (base: LogFields) => ({
    debug: (m: string, f?: LogFields) => emit("debug", m, { ...base, ...f }),
    info: (m: string, f?: LogFields) => emit("info", m, { ...base, ...f }),
    warn: (m: string, f?: LogFields) => emit("warn", m, { ...base, ...f }),
    error: (m: string, f?: LogFields) => emit("error", m, { ...base, ...f }),
  }),
};
