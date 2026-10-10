import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";

import type {
  AuthenticatedActor,
  StartedNativeLogin,
} from "../application/auth";
import {
  AuthService,
  LOGIN_TTL_SECONDS,
  SESSION_COOKIE_NAME,
} from "../application/auth";
import { AppHttpError, badRequest } from "../application/errors";
import {
  clearLocaleCookie,
  setLocaleCookie,
  setProfilePromptDismissedCookie,
} from "../cookies";
import {
  type AppBindings,
  clientIpAddress,
  publicRequestUrl,
  requireAuthenticated,
} from "../http";
// The catalogs come in with `i18nFor`, so the locale predicates come from the
// same module rather than half from here and half from the leaf.
import { i18nFor, isSelectableLocale, isSupportedLocale } from "../i18n";
import { deferred } from "../i18n/deferred";
import type { Translator } from "../i18n/translator";
import { loginEmailSenderFromEnv } from "../infrastructure/email/resend";
import { turnstileForContext } from "../infrastructure/turnstile";
import { storesForContext } from "../stores";
import {
  renderLoginError,
  renderLoginPage,
  renderLoginSent,
} from "../web/auth";
import { renderDonatePage } from "../web/donate";
import {
  renderEmailChangeConfirm,
  renderEmailLinkFailure,
  renderEmailUndo,
} from "../web/email-change";
import { FAVICON_CACHE_CONTROL, FAVICON_SVG } from "../web/favicon";
import { fieldValue, redirect, safeNext } from "../web/html";
import { renderProfile } from "../web/profile";
import {
  deliverEmailChangeRequest,
  emailChangeServiceForContext,
} from "./email-change";
import { clearSessionCookies, setSessionCookies } from "./session-cookies";
import { webActorOrLogin } from "./support";

interface LoginDeliveryResult {
  readonly confirmationUrl: string;
  readonly delivered: boolean;
}

function authService(context: Context<AppBindings>): AuthService {
  return new AuthService({ stores: storesForContext(context) });
}

function loginConfirmUrl(
  context: Context<AppBindings>,
  loginToken: string,
  next: string | null,
): string {
  const configured = context.env.AUTH_LOGIN_CONFIRM_URL;
  // The public URL, not the request's: behind a proxy the request says http
  // and the browser will not.
  const base =
    configured ?? new URL("/login/confirm", publicRequestUrl(context)).href;
  const url = new URL(base);

  url.searchParams.set("token", loginToken);

  if (next !== null) {
    url.searchParams.set("next", next);
  }

  return url.href;
}

async function deliverLoginEmail(
  context: Context<AppBindings>,
  started: StartedNativeLogin,
  next: string | null,
): Promise<LoginDeliveryResult> {
  const confirmationUrl = loginConfirmUrl(context, started.loginToken, next);
  const sender = loginEmailSenderFromEnv(context.env);

  if (sender === null) {
    if (context.env.CARNAP_ENV === "local") {
      return { confirmationUrl, delivered: false };
    }

    throw new AppHttpError(
      500,
      "login_email_not_configured",
      deferred.i18n.t(
        "Login email delivery is not configured for this environment.",
      ),
    );
  }

  // The recipient's own language when their account records one. The request's
  // is only a guess at it: a login link is asked for from whatever browser is
  // at hand — a lab machine, a phone, a fresh profile advertising `en` — and
  // the one person who reads this mail is the account owner, not the browser.
  // Nothing here reaches the response, so a known and an unknown address are
  // still answered identically.
  const stored = started.locale;
  const known = stored !== null && isSupportedLocale(stored);

  await sender.send({
    confirmationUrl,
    email: started.email,
    expiresInSeconds: LOGIN_TTL_SECONDS,
    i18n: known ? i18nFor(stored) : context.get("i18n"),
    locale: known ? stored : context.get("language"),
  });

  return { confirmationUrl, delivered: true };
}

export const webRoutes = new Hono<AppBindings>();

webRoutes.get("/", (context) => {
  if (context.get("actor") === null) {
    return redirect("/login", 302);
  }

  return redirect("/courses", 302);
});

webRoutes.get("/favicon.svg", (context) => {
  return context.body(FAVICON_SVG, 200, {
    "Cache-Control": FAVICON_CACHE_CONTROL,
    "Content-Type": "image/svg+xml; charset=utf-8",
  });
});

// Browsers and link unfurlers that never look at <link rel="icon"> ask for
// /favicon.ico by convention; point them at the one icon we have instead of
// letting the request fall through to the JSON 404 handler.
webRoutes.get("/favicon.ico", () => redirect("/favicon.svg", 302));

webRoutes.get("/donate", (context) => renderDonatePage(context));

webRoutes.get("/login", (context) => {
  if (context.get("actor") !== null) {
    return redirect("/");
  }

  const url = new URL(context.req.url);
  const next = safeNext(url.searchParams.get("next"));

  return renderLoginPage(context, {
    loggedOut: url.searchParams.has("loggedOut"),
    next: next ?? "",
  });
});

webRoutes.post("/login", async (context) => {
  const form = await context.req.raw.formData();
  const email = fieldValue(form.get("email"));
  const next = safeNext(fieldValue(form.get("next"))) ?? null;
  // Written into the form by Turnstile's own script; empty when the widget
  // was absent, unsolved, or JavaScript was off.
  const turnstileToken = fieldValue(form.get("cf-turnstile-response"));

  try {
    const started = await authService(context).startNativeLogin({
      email,
      ipAddress: clientIpAddress(context),
      turnstile: turnstileForContext(context),
      turnstileToken: turnstileToken.length === 0 ? null : turnstileToken,
    });
    const delivery = await deliverLoginEmail(context, started, next);

    return renderLoginSent(
      context,
      delivery.delivered ? null : delivery.confirmationUrl,
    );
  } catch (error) {
    if (error instanceof AppHttpError) {
      if (error.retryAfterSeconds !== undefined) {
        context.header("Retry-After", String(error.retryAfterSeconds));
      }

      return renderLoginError(context, {
        email,
        message: error.localize(context.get("i18n")),
        next: next ?? "",
        status: error.status,
      });
    }

    throw error;
  }
});

/**
 * Follow a login link from an email.
 *
 * A link that no longer works is the ordinary case here, not an exceptional
 * one: the token is single-use and short-lived, so it expires by design, and a
 * reader who opens yesterday's email meets this every time. So the failure is
 * answered with the login form and a sentence explaining what to do, rather than
 * with the generic error page — the next step is always "send me another one",
 * and this is the page that does it. `next` rides along so a second link lands
 * where the first was meant to.
 */
webRoutes.get("/login/confirm", async (context) => {
  const url = new URL(context.req.url);
  const token = url.searchParams.get("token");
  const next = safeNext(url.searchParams.get("next"));

  try {
    if (token === null) {
      throw badRequest(
        "invalid_login_token",
        deferred.i18n.t("A login token is required."),
      );
    }

    const confirmed = await authService(context).confirmNativeLogin(token);

    // An address a recent change moved its account away from opens only that
    // change's undo, which the page behind this link offers.
    if (confirmed.kind === "undo") {
      return redirect(emailUndoPath(confirmed.undoToken), 303);
    }

    setSessionCookies(context, confirmed.sessionToken, confirmed.csrfToken);

    return context.redirect(next ?? "/courses", 303);
  } catch (error) {
    if (!(error instanceof AppHttpError)) {
      throw error;
    }

    const i18n = context.get("i18n");

    return renderLoginError(context, {
      email: "",
      // Only the token's own failure gets the reassuring wording. Anything else
      // raised along the way — a rejected account, say — has its own reason, and
      // telling that reader to request a new link would send them in a circle.
      message:
        error.code === "invalid_login_token"
          ? i18n.t(
              "That login link has expired or has already been used. Enter your email address below and we will send you a new one.",
            )
          : error.localize(i18n),
      next: next ?? "",
      status: error.status,
    });
  }
});

webRoutes.get("/profile", async (context) => {
  const loginRedirect = webActorOrLogin(context);

  if (loginRedirect !== null) {
    return loginRedirect;
  }

  const actor = requireAuthenticated(context);
  const account = await authService(context).describeOwnAccount(actor);
  const url = new URL(context.req.url);
  const i18n = context.get("i18n");
  const notice = url.searchParams.has("saved")
    ? i18n.t("Your profile has been saved.")
    : url.searchParams.has("unlinked")
      ? i18n.t("The LMS link was removed.")
      : url.searchParams.has("email")
        ? i18n.t("Your email address has been changed.")
        : url.searchParams.has("sent")
          ? emailSentNotice(i18n)
          : url.searchParams.has("restored")
            ? i18n.t(
                "Your old email address is back, and every other session on your account has been signed out.",
              )
            : undefined;

  return renderProfile(
    context,
    actor,
    account,
    notice === undefined ? {} : { notice },
  );
});

/**
 * Save the profile — name and language together, since they are one form.
 *
 * An empty `locale` means "go on following the request", so it is stored as
 * null rather than refused. The stored preference outranks the cookie for a
 * signed-in reader, but the cookie is written too: so that logging out does not
 * silently revert the language, and so the choice survives on a shared browser.
 *
 * No confirmation of the language is needed beyond the redirect: the page comes
 * back written in it, which says it better than a notice would.
 */
webRoutes.post("/profile", async (context) => {
  const actor = requireAuthenticated(context);
  const form = await context.req.raw.formData();
  const name = fieldValue(form.get("name"));
  const locale = fieldValue(form.get("locale"));

  try {
    await authService(context).updateOwnProfile(actor, {
      locale: locale === "" ? null : locale,
      name,
    });

    if (isSelectableLocale(locale)) {
      setLocaleCookie(context, locale);
    } else {
      clearLocaleCookie(context);
    }

    // `context.redirect`, not the `redirect` helper: the helper builds a fresh
    // Response, which drops the cookie staged above with it.
    return context.redirect("/profile?saved=1", 303);
  } catch (error) {
    if (error instanceof AppHttpError) {
      const account = await authService(context).describeOwnAccount(actor);

      return renderProfile(context, actor, account, {
        error: error.localize(context.get("i18n")),
        localeValue: locale,
        nameValue: name,
        status: error.status,
      });
    }

    throw error;
  }
});

/**
 * Put the incomplete-profile prompt away for this browsing session.
 *
 * It lands back on the page the reader was on rather than on /profile: they
 * have just said they do not want to go there. `safeNext` is what keeps that
 * an in-site path — the field is posted, so it is as forgeable as any other.
 */
webRoutes.post("/profile/prompt/dismiss", async (context) => {
  requireAuthenticated(context);

  const form = await context.req.raw.formData();
  const next = safeNext(fieldValue(form.get("next")));

  setProfilePromptDismissedCookie(context);

  // `context.redirect`, not the `redirect` helper, which would build a fresh
  // Response and drop the cookie staged above with it.
  return context.redirect(next ?? "/courses", 303);
});

webRoutes.post("/profile/identities/remove", async (context) => {
  const actor = requireAuthenticated(context);
  const form = await context.req.raw.formData();
  const identityId = fieldValue(form.get("identityId"));

  try {
    await authService(context).removeOwnIdentity(actor, identityId);

    return redirect("/profile?unlinked=1", 303);
  } catch (error) {
    return profileErrorOrThrow(context, actor, error);
  }
});

/**
 * "Use that instead": take the address one of the actor's LMSs now asserts,
 * and hand the address back to their LMSs. See `EmailChangeService`.
 */
webRoutes.post("/profile/email/lms", async (context) => {
  const actor = requireAuthenticated(context);
  const form = await context.req.raw.formData();
  const identityId = fieldValue(form.get("identityId"));

  try {
    await emailChangeServiceForContext(context).useLmsEmail(
      actor,
      identityId,
    );

    return redirect("/profile?email=1", 303);
  } catch (error) {
    return profileErrorOrThrow(context, actor, error);
  }
});

/**
 * Ask to move to a new address. The reply is the same whether a confirmation
 * link went or a note that the address is taken did: which of the two is for
 * the address's holder to read, not for whoever typed it.
 */
webRoutes.post("/profile/email", async (context) => {
  const actor = requireAuthenticated(context);
  const form = await context.req.raw.formData();
  const email = fieldValue(form.get("email"));

  try {
    const requested = await emailChangeServiceForContext(context).request(
      actor,
      { email, ipAddress: clientIpAddress(context) },
    );
    const localLink = await deliverEmailChangeRequest(context, requested);

    if (localLink === null) {
      return redirect("/profile?sent=1", 303);
    }

    const account = await authService(context).describeOwnAccount(actor);

    return renderProfile(context, actor, account, {
      localEmailLink: localLink,
      notice: emailSentNotice(context.get("i18n")),
    });
  } catch (error) {
    if (
      error instanceof AppHttpError &&
      error.retryAfterSeconds !== undefined
    ) {
      context.header("Retry-After", String(error.retryAfterSeconds));
    }

    return profileErrorOrThrow(context, actor, error, { emailValue: email });
  }
});

/**
 * Follow a confirmation link. The GET only describes the change: mail
 * scanners fetch links, and a fetch that completed it would confirm an
 * address nobody looked at. The button's POST makes it.
 */
webRoutes.get("/profile/email/confirm", async (context) => {
  const token = new URL(context.req.url).searchParams.get("token") ?? "";

  try {
    const pending =
      await emailChangeServiceForContext(context).describeConfirmation(token);

    return renderEmailChangeConfirm(context, { ...pending, token });
  } catch (error) {
    return emailLinkFailureOrThrow(context, error);
  }
});

webRoutes.post("/profile/email/confirm", async (context) => {
  const token = fieldValue((await context.req.raw.formData()).get("token"));

  try {
    const confirmed =
      await emailChangeServiceForContext(context).confirm(token);

    setSessionCookies(context, confirmed.sessionToken, confirmed.csrfToken);

    return context.redirect("/profile?email=1", 303);
  } catch (error) {
    return emailLinkFailureOrThrow(context, error);
  }
});

/** Follow an undo link: the GET describes, the POST undoes, as above. */
webRoutes.get("/profile/email/undo", async (context) => {
  const token = new URL(context.req.url).searchParams.get("token") ?? "";

  try {
    const pending =
      await emailChangeServiceForContext(context).describeUndo(token);

    return renderEmailUndo(context, { ...pending, token });
  } catch (error) {
    return emailLinkFailureOrThrow(context, error);
  }
});

webRoutes.post("/profile/email/undo", async (context) => {
  const token = fieldValue((await context.req.raw.formData()).get("token"));

  try {
    const restored = await emailChangeServiceForContext(context).undo(token);

    setSessionCookies(context, restored.sessionToken, restored.csrfToken);

    return context.redirect("/profile?restored=1", 303);
  } catch (error) {
    return emailLinkFailureOrThrow(context, error);
  }
});

function emailSentNotice(i18n: Translator): string {
  return i18n.t(
    "We sent a link to the new address. Open it to finish the change.",
  );
}

function emailUndoPath(token: string): string {
  return `/profile/email/undo?token=${encodeURIComponent(token)}`;
}

/** An emailed link that cannot be used, answered with a page saying so. */
function emailLinkFailureOrThrow(
  context: Context<AppBindings>,
  error: unknown,
): Response {
  if (!(error instanceof AppHttpError)) {
    throw error;
  }

  return renderEmailLinkFailure(context, {
    message: error.localize(context.get("i18n")),
    status: error.status,
  });
}

/** The profile page again, with a refused action's reason on it. */
async function profileErrorOrThrow(
  context: Context<AppBindings>,
  actor: AuthenticatedActor,
  error: unknown,
  values: { readonly emailValue?: string } = {},
): Promise<Response> {
  if (!(error instanceof AppHttpError)) {
    throw error;
  }

  const account = await authService(context).describeOwnAccount(actor);

  return renderProfile(context, actor, account, {
    ...values,
    error: error.localize(context.get("i18n")),
    status: error.status,
  });
}

webRoutes.post("/logout", async (context) => {
  const sessionToken = getCookie(context, SESSION_COOKIE_NAME);

  if (sessionToken !== undefined) {
    await authService(context).logout(sessionToken);
  }

  clearSessionCookies(context);

  return context.redirect("/login?loggedOut=1", 303);
});
