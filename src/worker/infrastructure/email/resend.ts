import type {
  LoginEmailSender,
  SendLoginEmailInput,
} from "../../application/auth";
import { escapeHtml } from "../../application/content/render-support";
import type {
  SendEmailChangeNoticeInput,
  SendEmailTakenInput,
} from "../../application/email-change";
import { AppHttpError } from "../../application/errors";
import type { Env } from "../../env";
import { withUserAgent } from "../../user-agent";
import { type Fetcher, platformFetcher } from "../fetch";

interface ResendEmailResponse {
  readonly id?: unknown;
  readonly message?: unknown;
  readonly name?: unknown;
}

/**
 * The subject and body of one kind of transactional email. Each part is a
 * function of the recipient's translator, which rides in on the send input:
 * an email is composed once and read once, in whatever language the person
 * asking for it was using.
 */
export interface EmailCopy<Input = SendLoginEmailInput> {
  readonly html: (input: Input) => string;
  readonly subject: (input: Input) => string;
  readonly text: (input: Input) => string;
}

export interface ResendEmailSenderOptions<Input> {
  readonly apiKey: string;
  readonly copy: EmailCopy<Input>;
  readonly fetcher?: Fetcher;
  readonly from: string;
}

/** One kind of email, delivered through Resend to `input.email`. */
export class ResendEmailSender<Input extends { readonly email: string }> {
  private readonly fetcher: Fetcher;

  constructor(private readonly options: ResendEmailSenderOptions<Input>) {
    this.fetcher = options.fetcher ?? platformFetcher;
  }

  async send(input: Input): Promise<void> {
    const { copy } = this.options;
    const response = await this.fetcher("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: this.options.from,
        html: copy.html(input),
        subject: copy.subject(input),
        text: copy.text(input),
        to: [input.email],
      }),
      headers: withUserAgent({
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      }),
      method: "POST",
    });

    if (response.ok) {
      return;
    }

    let detail = "Resend rejected the email.";

    try {
      const body = (await response.json()) as ResendEmailResponse;

      if (typeof body.message === "string" && body.message.length > 0) {
        detail = body.message;
      }
    } catch (_error) {
      // Keep the generic message if Resend does not return JSON.
    }

    throw new AppHttpError(
      500,
      "login_email_delivery_failed",
      `Email delivery failed: ${detail}`,
    );
  }
}

export interface ResendLoginEmailSenderOptions {
  readonly apiKey: string;
  readonly copy?: EmailCopy;
  readonly fetcher?: Fetcher;
  readonly from: string;
}

export class ResendLoginEmailSender
  extends ResendEmailSender<SendLoginEmailInput>
  implements LoginEmailSender
{
  constructor(options: ResendLoginEmailSenderOptions) {
    super({ ...options, copy: options.copy ?? loginEmailCopy });
  }
}

/**
 * A sender for one kind of email, or null where this deployment has no mail
 * delivery configured.
 */
function resendSenderFromEnv<Input extends { readonly email: string }>(
  env: Env,
  copy: EmailCopy<Input>,
): ResendEmailSender<Input> | null {
  if (
    env.RESEND_API_KEY === undefined ||
    env.AUTH_LOGIN_EMAIL_FROM === undefined
  ) {
    return null;
  }

  return new ResendEmailSender({
    apiKey: env.RESEND_API_KEY,
    copy,
    from: env.AUTH_LOGIN_EMAIL_FROM,
  });
}

/** The link that confirms a new address, sent to that address. */
export function emailChangeConfirmSenderFromEnv(
  env: Env,
): ResendEmailSender<SendLoginEmailInput> | null {
  return resendSenderFromEnv(env, emailChangeConfirmCopy);
}

/** The reply to a request to move to an address another account uses. */
export function emailTakenSenderFromEnv(
  env: Env,
): ResendEmailSender<SendEmailTakenInput> | null {
  return resendSenderFromEnv(env, emailTakenCopy);
}

/** The notice to an address an account was moved away from. */
export function emailChangeNoticeSenderFromEnv(
  env: Env,
): ResendEmailSender<SendEmailChangeNoticeInput> | null {
  return resendSenderFromEnv(env, emailChangeNoticeCopy);
}

export function loginEmailSenderFromEnv(env: Env): LoginEmailSender | null {
  return resendSenderFromEnv(env, loginEmailCopy);
}

/**
 * The sender for LTI account-link confirmations: an LMS launch asserted the
 * email of an existing account, and the account owner must approve the link.
 * Same delivery machinery as login links, different copy.
 */
export function ltiLinkEmailSenderFromEnv(env: Env): LoginEmailSender | null {
  return resendSenderFromEnv(env, ltiLinkEmailCopy);
}

const loginEmailCopy: EmailCopy = {
  html: ({ confirmationUrl, expiresInSeconds, i18n, locale }) =>
    [
      `<p>${escapeHtml(i18n.t("Use this link to sign in to Carnap:"))}</p>`,
      `<p><a href="${escapeHtml(confirmationUrl)}">${escapeHtml(i18n.t("Sign in"))}</a></p>`,
      `<p>${escapeHtml(
        i18n.t("This link expires {duration} after it was sent.", {
          duration: formatLifetime(expiresInSeconds, locale),
        }),
      )}</p>`,
    ].join(""),
  subject: ({ i18n }) => i18n.t("Your Carnap login link"),
  text: ({ confirmationUrl, expiresInSeconds, i18n, locale }) =>
    [
      i18n.t("Use this link to sign in to Carnap:"),
      "",
      confirmationUrl,
      "",
      i18n.t("This link expires {duration} after it was sent.", {
        duration: formatLifetime(expiresInSeconds, locale),
      }),
    ].join("\n"),
};

const ltiLinkEmailCopy: EmailCopy = {
  html: ({ confirmationUrl, expiresInSeconds, i18n, locale }) =>
    [
      `<p>${escapeHtml(
        i18n.t(
          "A launch from your institution's LMS asked to connect to your Carnap account. If this was you, use this link to approve it:",
        ),
      )}</p>`,
      `<p><a href="${escapeHtml(confirmationUrl)}">${escapeHtml(i18n.t("Connect LMS identity"))}</a></p>`,
      `<p>${escapeHtml(
        i18n.t("This link expires {duration} after it was sent.", {
          duration: formatLifetime(expiresInSeconds, locale),
        }),
      )} ${escapeHtml(
        i18n.t(
          "If you did not expect this, ignore this email and nothing will be linked.",
        ),
      )}</p>`,
    ].join(""),
  subject: ({ i18n }) => i18n.t("Confirm your Carnap account link"),
  text: ({ confirmationUrl, expiresInSeconds, i18n, locale }) =>
    [
      i18n.t(
        "A launch from your institution's LMS asked to connect to your Carnap account. If this was you, use this link to approve it:",
      ),
      "",
      confirmationUrl,
      "",
      i18n.t("This link expires {duration} after it was sent.", {
        duration: formatLifetime(expiresInSeconds, locale),
      }),
      i18n.t(
        "If you did not expect this, ignore this email and nothing will be linked.",
      ),
    ].join("\n"),
};

const emailChangeConfirmCopy: EmailCopy = {
  html: ({ confirmationUrl, expiresInSeconds, i18n, locale }) =>
    [
      `<p>${escapeHtml(
        i18n.t(
          "Someone signed in to Carnap asked to use this address for their account. If this was you, use this link to confirm it:",
        ),
      )}</p>`,
      `<p><a href="${escapeHtml(confirmationUrl)}">${escapeHtml(i18n.t("Confirm new address"))}</a></p>`,
      `<p>${escapeHtml(
        i18n.t("This link expires {duration} after it was sent.", {
          duration: formatLifetime(expiresInSeconds, locale),
        }),
      )} ${escapeHtml(
        i18n.t(
          "If you did not ask for this, ignore this email and nothing will change.",
        ),
      )}</p>`,
    ].join(""),
  subject: ({ i18n }) => i18n.t("Confirm your new Carnap email address"),
  text: ({ confirmationUrl, expiresInSeconds, i18n, locale }) =>
    [
      i18n.t(
        "Someone signed in to Carnap asked to use this address for their account. If this was you, use this link to confirm it:",
      ),
      "",
      confirmationUrl,
      "",
      i18n.t("This link expires {duration} after it was sent.", {
        duration: formatLifetime(expiresInSeconds, locale),
      }),
      i18n.t(
        "If you did not ask for this, ignore this email and nothing will change.",
      ),
    ].join("\n"),
};

const emailTakenCopy: EmailCopy<SendEmailTakenInput> = {
  html: ({ i18n }) =>
    [
      `<p>${escapeHtml(
        i18n.t(
          "Someone signed in to Carnap asked to use this address for their account, but another Carnap account already uses it, so nothing has changed.",
        ),
      )}</p>`,
      `<p>${escapeHtml(
        i18n.t(
          "If this was you, sign in with this address to reach the account that has it. If not, you can ignore this email.",
        ),
      )}</p>`,
    ].join(""),
  subject: ({ i18n }) => i18n.t("Your Carnap email address was not changed"),
  text: ({ i18n }) =>
    [
      i18n.t(
        "Someone signed in to Carnap asked to use this address for their account, but another Carnap account already uses it, so nothing has changed.",
      ),
      "",
      i18n.t(
        "If this was you, sign in with this address to reach the account that has it. If not, you can ignore this email.",
      ),
    ].join("\n"),
};

/** The notice's opening sentence, which says who made the change. */
function noticeLead(input: SendEmailChangeNoticeInput): string {
  const { i18n, newEmail } = input;

  return input.byAdmin
    ? i18n.t(
        "A Carnap administrator changed the email address of your Carnap account to {address}. This address no longer signs in to it.",
        { address: newEmail },
      )
    : i18n.t(
        "The email address of your Carnap account was changed to {address}. This address no longer signs in to it.",
        { address: newEmail },
      );
}

/**
 * What to do if the change was unwanted: the undo, the earlier change's undo
 * that still covers this one, or whom to ask.
 */
function noticeRemedy(input: SendEmailChangeNoticeInput): string {
  const { expiresInSeconds, i18n, locale } = input;

  if (input.undoUrl !== null) {
    return i18n.t(
      "If you did not make this change, use the link below to undo it and sign in. It works for {duration}.",
      { duration: formatLifetime(expiresInSeconds, locale) },
    );
  }

  return input.byAdmin
    ? i18n.t(
        "If you did not expect this, contact the administrator of your Carnap site.",
      )
    : i18n.t(
        "The address had been changed shortly before this as well. The link to undo that earlier change went to the address the account had then, and it puts that address back. If you did not expect this, contact the administrator of your Carnap site.",
      );
}

const emailChangeNoticeCopy: EmailCopy<SendEmailChangeNoticeInput> = {
  html: (input) =>
    [
      `<p>${escapeHtml(noticeLead(input))}</p>`,
      `<p>${escapeHtml(noticeRemedy(input))}</p>`,
      input.undoUrl === null
        ? ""
        : `<p><a href="${escapeHtml(input.undoUrl)}">${escapeHtml(input.i18n.t("Undo the change"))}</a></p>`,
    ].join(""),
  subject: ({ i18n }) => i18n.t("Your Carnap email address was changed"),
  text: (input) =>
    [
      noticeLead(input),
      "",
      noticeRemedy(input),
      ...(input.undoUrl === null ? [] : ["", input.undoUrl]),
    ].join("\n"),
};

/**
 * How long the link lives, as a phrase in the reader's language: "10 minutes",
 * "24 hours", "10 Minuten". `Intl` rather than a hand-built string because it
 * gets the plural and the spacing right in every locale, including the ones
 * where "1 minute" is not simply the number with a word after it.
 *
 * Whole hours are said in hours; everything else in minutes. A day is left as
 * "24 hours" on purpose — for something that expires, hours are the unit the
 * reader is actually counting in — but a week of them is said in days.
 */
function formatLifetime(expiresInSeconds: number, locale: string): string {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  const days = minutes / (60 * 24);

  if (Number.isInteger(days) && days >= 2) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "day",
      unitDisplay: "long",
    }).format(days);
  }

  const useHours = minutes >= 60 && minutes % 60 === 0;

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: useHours ? "hour" : "minute",
    unitDisplay: "long",
  }).format(useHours ? minutes / 60 : minutes);
}
