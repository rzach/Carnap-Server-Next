import type { Context } from "hono";

import { type AppBindings, clientIpAddress } from "./http";
import {
  type EventLog,
  type LogFields,
  type LogLevel,
  logEvent,
} from "./log";

/**
 * A log line about this request: `logEvent` with the request ID and the
 * client's address added, so an operator can follow one person's attempts
 * across lines. The address is what the request reports (see
 * `clientIpAddress`).
 */
export function logRequestEvent(
  context: Context<AppBindings>,
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  logEvent(level, event, {
    ip: clientIpAddress(context) ?? undefined,
    requestId: context.get("requestId"),
    ...fields,
  });
}

/** `logRequestEvent` bound to this request, for a service to write through. */
export function requestLog(context: Context<AppBindings>): EventLog {
  return (level, event, fields) =>
    logRequestEvent(context, level, event, fields);
}
