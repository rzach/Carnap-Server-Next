import type { JsonValue } from "./domain/json";

/**
 * The one way the application writes a log line: a single JSON object per
 * line, `{"time", "level", "event", ...fields}`, so a log collector can parse
 * every line the same way on both hosts. Under Bun, `console.error(name, obj)`
 * prints an inspection dump spread over several lines, which no SIEM reads;
 * on Workers a JSON line is parsed into fields by Workers Logs just as an
 * object is.
 *
 * Errors go to stderr and everything else to stdout. Docker collects both.
 *
 * Never put a token, a key, a whole JWT or an email address in `fields`. The
 * event names and their fields are listed in docs/self-hosting.md (Logging),
 * because operators build alerts on them.
 */

export type LogLevel = "error" | "info" | "warn";

/** `undefined` fields are dropped, so a caller can pass optional values. */
export type LogFields = Readonly<Record<string, JsonValue | undefined>>;

export function logEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** An error's message for a log field, whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The domain of an address, the most of it a log line carries: enough to see
 * an attack aimed at one institution, without writing addresses into logs.
 */
export function emailDomain(email: string): string | undefined {
  const at = email.lastIndexOf("@");

  return at < 0 ? undefined : email.slice(at + 1).toLowerCase();
}
