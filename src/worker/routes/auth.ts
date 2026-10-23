import { type Context, Hono } from "hono";

import { type AuthenticatedActor, AuthService } from "../application/auth";
import { badRequest } from "../application/errors";
import { readSessionCookie } from "../cookies";
import {
  type AppBindings,
  clientIpAddress,
  requireAuthenticated,
} from "../http";
import { deferred } from "../i18n/deferred";
import { turnstileForContext } from "../infrastructure/turnstile";
import { requestLog } from "../request-log";
import { storesForContext } from "../stores";
import { clearSessionCookies, setSessionCookies } from "./session-cookies";
import { readJsonObject } from "./support";

interface StartLoginBody {
  readonly email?: unknown;
  readonly turnstileToken?: unknown;
}

interface ConfirmLoginBody {
  /** The enrollment link the sign-in began at; see `confirmNativeLogin`. */
  readonly enrollmentToken?: unknown;
  readonly loginToken?: unknown;
}

/**
 * The auth service for a request: its stores, and its sign-in lines bound to
 * the request's address and ID.
 */
export function authServiceForContext(
  context: Context<AppBindings>,
): AuthService {
  return new AuthService({
    log: requestLog(context),
    stores: storesForContext(context),
  });
}

function publicUser(actor: AuthenticatedActor) {
  return {
    id: actor.user.id,
    email: actor.user.email,
    name: actor.user.name,
  };
}

export const authRoutes = new Hono<AppBindings>();

authRoutes.post("/login/start", async (context) => {
  const body = (await readJsonObject(context)) as StartLoginBody;

  if (typeof body.email !== "string") {
    throw badRequest(
      "invalid_email",
      deferred.i18n.t("A valid email address is required."),
    );
  }

  const started = await authServiceForContext(context).startNativeLogin({
    email: body.email,
    ipAddress: clientIpAddress(context),
    turnstile: turnstileForContext(context),
    turnstileToken:
      typeof body.turnstileToken === "string" &&
      body.turnstileToken.length > 0
        ? body.turnstileToken
        : null,
  });
  const includeLoginToken = context.env.CARNAP_ENV === "local";

  return context.json(
    {
      login: {
        email: started.email,
        expiresAt: started.expiresAt,
        loginToken: includeLoginToken ? started.loginToken : undefined,
      },
    },
    202,
  );
});

authRoutes.post("/login/confirm", async (context) => {
  const body = (await readJsonObject(context)) as ConfirmLoginBody;

  if (typeof body.loginToken !== "string") {
    throw badRequest(
      "invalid_login_token",
      deferred.i18n.t("A login token is required."),
    );
  }

  const confirmed = await authServiceForContext(context).confirmNativeLogin(
    body.loginToken,
    {
      enrollmentToken:
        typeof body.enrollmentToken === "string"
          ? body.enrollmentToken
          : null,
    },
  );

  // The address was moved off its account recently; it opens that change's
  // undo, which is a page, not a session.
  if (confirmed.kind === "undo") {
    return context.json({
      undo: {
        url: `/profile/email/undo?token=${encodeURIComponent(confirmed.undoToken)}`,
      },
    });
  }

  setSessionCookies(context, confirmed.sessionToken, confirmed.csrfToken);

  return context.json({
    actor: publicUser(confirmed.actor),
    csrfToken: confirmed.csrfToken,
  });
});

authRoutes.get("/me", (context) => {
  const actor = requireAuthenticated(context);

  return context.json({ actor: publicUser(actor) });
});

authRoutes.post("/logout", async (context) => {
  const actor = requireAuthenticated(context);
  const sessionToken = readSessionCookie(context);

  if (sessionToken !== undefined) {
    await authServiceForContext(context).logout(sessionToken, actor);
  }

  clearSessionCookies(context);

  return context.body(null, 204);
});
