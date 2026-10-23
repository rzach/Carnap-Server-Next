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

export interface SiteSettings {
  readonly nativeRegistration: NativeRegistration;
}

/**
 * What an instance has before an administrator changes anything. Registration
 * is open by default because the first administrator signs in by email before
 * there is anyone to invite them.
 */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  nativeRegistration: "public",
};

export interface SetNativeRegistrationInput {
  readonly updatedAt: Timestamp;
  readonly updatedById: AppId;
  readonly value: NativeRegistration;
}
