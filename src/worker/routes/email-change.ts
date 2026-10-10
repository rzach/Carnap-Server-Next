import type { Context } from "hono";

import { AuthService } from "../application/auth";
import {
  EMAIL_CHANGE_CONFIRM_TTL_SECONDS,
  EMAIL_CHANGE_UNDO_TTL_SECONDS,
  type EmailChangeNotice,
  type EmailChangeNotifier,
  EmailChangeService,
  type RequestedEmailChange,
} from "../application/email-change";
import { AppHttpError } from "../application/errors";
import { type AppBindings, publicRequestUrl } from "../http";
import { i18nFor, isSupportedLocale } from "../i18n";
import { deferred } from "../i18n/deferred";
import {
  emailChangeConfirmSenderFromEnv,
  emailChangeNoticeSenderFromEnv,
  emailTakenSenderFromEnv,
} from "../infrastructure/email/resend";
import { storesForContext } from "../stores";

/**
 * The language to write to an account's holder in: the one they stored, else
 * the request's. Callers pass the stored language of the account whose
 * mailbox the email goes to, which is not always the requester's: the note
 * that an address is taken goes to the account that has it.
 */
function recipientLanguage(
  context: Context<AppBindings>,
  stored: string | null,
): string {
  return stored !== null && isSupportedLocale(stored)
    ? stored
    : context.get("language");
}

function emailLinkUrl(
  context: Context<AppBindings>,
  path: string,
  token: string,
): string {
  const url = new URL(path, publicRequestUrl(context));

  url.searchParams.set("token", token);

  return url.href;
}

/**
 * Run a send after the response where the host can, and wait for it where it
 * cannot. Waiting is what a test, with no execution context, needs in order to
 * see the mail; deferring is what a launch needs so as not to wait on Resend.
 */
async function sendInBackground(
  context: Context<AppBindings>,
  send: Promise<void>,
): Promise<void> {
  try {
    context.executionCtx.waitUntil(send);
  } catch (_error) {
    await send;
  }
}

/**
 * The notifier for the address a change moved an account away from, or null
 * where no mail can be sent — and then no undo is recorded, since nobody could
 * receive it. Under `CARNAP_ENV=local` with no mail configured, the notice's
 * link is logged instead, as the login page shows its link there.
 */
export function emailChangeNotifierForContext(
  context: Context<AppBindings>,
): EmailChangeNotifier | null {
  const sender = emailChangeNoticeSenderFromEnv(context.env);
  const local = context.env.CARNAP_ENV === "local";

  if (sender === null && !local) {
    return null;
  }

  const requestId = context.get("requestId");

  return {
    async notify(notice: EmailChangeNotice): Promise<void> {
      const undoUrl =
        notice.undoToken === null
          ? null
          : emailLinkUrl(context, "/profile/email/undo", notice.undoToken);

      if (sender === null) {
        console.info("email_change_notice_local", { undoUrl });

        return;
      }

      const language = recipientLanguage(context, notice.locale);
      // Logged and dropped on failure: the change it reports has happened,
      // and the page the holder is looking at says so.
      const send = sender
        .send({
          byAdmin: notice.byAdmin,
          email: notice.email,
          expiresInSeconds: EMAIL_CHANGE_UNDO_TTL_SECONDS,
          i18n: i18nFor(language),
          locale: language,
          newEmail: notice.newEmail,
          undoUrl,
        })
        .catch((error: unknown) => {
          console.error("email_change_notice_failed", {
            error: error instanceof Error ? error.message : String(error),
            requestId,
          });
        });

      await sendInBackground(context, send);
    },
  };
}

export function emailChangeServiceForContext(
  context: Context<AppBindings>,
): EmailChangeService {
  const stores = storesForContext(context);

  return new EmailChangeService({
    auth: new AuthService({ stores }),
    notifier: emailChangeNotifierForContext(context),
    stores,
  });
}

/**
 * Send what a request to move to a new address sends: the confirmation link,
 * or the note that the address is taken. Returns the link itself under
 * `CARNAP_ENV=local` with no mail configured, for the page to show, as the
 * login page does; null when an email went.
 *
 * A confirmation that cannot be sent is withdrawn, so that nothing claims a
 * link is on its way that never can be.
 */
export async function deliverEmailChangeRequest(
  context: Context<AppBindings>,
  requested: RequestedEmailChange,
): Promise<string | null> {
  const local = context.env.CARNAP_ENV === "local";
  const language = recipientLanguage(context, requested.locale);
  const i18n = i18nFor(language);

  if (requested.kind === "taken") {
    const sender = emailTakenSenderFromEnv(context.env);

    if (sender === null) {
      if (local) {
        return null;
      }

      throw emailNotConfigured();
    }

    await sender.send({ email: requested.email, i18n, locale: language });

    return null;
  }

  const confirmationUrl = emailLinkUrl(
    context,
    "/profile/email/confirm",
    requested.token,
  );
  const sender = emailChangeConfirmSenderFromEnv(context.env);

  if (sender === null) {
    if (local) {
      return confirmationUrl;
    }

    await emailChangeServiceForContext(context).withdraw(requested.token);

    throw emailNotConfigured();
  }

  try {
    await sender.send({
      confirmationUrl,
      email: requested.email,
      expiresInSeconds: EMAIL_CHANGE_CONFIRM_TTL_SECONDS,
      i18n,
      locale: language,
    });
  } catch (error) {
    await emailChangeServiceForContext(context).withdraw(requested.token);

    throw error;
  }

  return null;
}

function emailNotConfigured(): AppHttpError {
  return new AppHttpError(
    500,
    "email_not_configured",
    deferred.i18n.t("Email delivery is not configured for this environment."),
  );
}
