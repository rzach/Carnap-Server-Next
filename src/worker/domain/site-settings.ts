import type { AppId } from "./ids";
import type { Timestamp } from "./time";

/**
 * Who may create an account by signing in with an email link.
 *
 * - `public`: anyone with a mailbox. The first link from an unknown address
 *   creates its account.
 * - `link_only`: only someone signing in through a course enrollment link
 *   that is still valid. An instructor's link is the invitation.
 * - `lms_only`: nobody. Accounts are created only by LTI launches.
 *
 * Whatever the mode, an existing account, an LTI-created one included, still
 * signs in by email, and LTI launches still create accounts.
 */
export type NativeRegistration = "link_only" | "lms_only" | "public";

export const NATIVE_REGISTRATION_MODES: readonly NativeRegistration[] = [
  "public",
  "link_only",
  "lms_only",
];

export function isNativeRegistration(
  value: unknown,
): value is NativeRegistration {
  return NATIVE_REGISTRATION_MODES.includes(value as NativeRegistration);
}

/**
 * What an instance says about itself on `/about`, beside the part every
 * instance shows (what Carnap is, where its source lives, which commit is
 * running). It is where an operator puts what the law may ask of them — an
 * Impressum, a privacy notice, whom to contact — so it is readable signed out.
 *
 * Kept as the administrator wrote it and as it compiled, the way a lesson keeps
 * its source and its artifact: the source is what the editor shows again, and
 * the HTML is what a reader is served without compiling anything.
 */
export interface AboutPage {
  readonly html: string;
  readonly source: string;
}

export interface SiteSettings {
  /** Null until an administrator writes one; the page then shows only its own part. */
  readonly about: AboutPage | null;
  readonly nativeRegistration: NativeRegistration;
}

/**
 * What an instance has before an administrator changes anything. Registration
 * is open by default because the first administrator signs in by email before
 * there is anyone to invite them.
 */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  about: null,
  nativeRegistration: "public",
};

export interface SetNativeRegistrationInput {
  readonly updatedAt: Timestamp;
  readonly updatedById: AppId;
  readonly value: NativeRegistration;
}

/** `value` null clears the page back to the built-in part alone. */
export interface SetAboutPageInput {
  readonly updatedAt: Timestamp;
  readonly updatedById: AppId;
  readonly value: AboutPage | null;
}
