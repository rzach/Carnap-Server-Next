import type { Context } from "hono";

import { AppHttpError } from "./application/errors";
import { type AppBindings, clientIpAddress } from "./http";
import { emailDomain, type LogFields, type LogLevel, logEvent } from "./log";

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

/**
 * A refused email sign-in, as a `sign_in_failed` line: `request` when asking
 * for a link failed (a bad address, the throttle, the human check), `confirm`
 * when opening one did (an expired or used link, a suspended account, closed
 * registration). `reason` is the error's code. Only the address's domain is
 * written, and only at the request stage, where the address is what the
 * requester typed.
 */
export function logSignInFailed(
  context: Context<AppBindings>,
  stage: "confirm" | "request",
  error: unknown,
  email?: string,
): void {
  if (!(error instanceof AppHttpError)) {
    return;
  }

  logRequestEvent(context, "warn", "sign_in_failed", {
    emailDomain: email === undefined ? undefined : emailDomain(email),
    reason: error.code,
    stage,
  });
}
