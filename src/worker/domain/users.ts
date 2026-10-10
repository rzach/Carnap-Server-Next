import type { AppId } from "./ids";
import type { Timestamp } from "./time";

export type ExternalIdentityProvider = "native" | "lti";

/**
 * Who owns an account's email address, and so who may change it.
 *
 * - `lti`: an LMS asserted it. A launch whose platform has just changed the
 *   address it sends carries the change over, from any linked platform.
 * - `user`: the account holder chose it — by typing it at a native sign-in or
 *   by confirming a change. Launches leave it alone.
 * - `admin`: a site administrator set it. Launches leave it alone too; kept
 *   apart from `user` so that the account holder is told who did it.
 *
 * Proving the mailbox (a native sign-in) verifies the address without moving
 * its ownership: verification is a fact about the mailbox, ownership about who
 * gets to replace it.
 */
export type EmailSource = "lti" | "user" | "admin";

/**
 * The domain of the stand-in address an account gets when its creating launch
 * carried no email. `.invalid` is reserved (RFC 2606), so it can never be
 * delivered to, and never collides with a real address.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "lti.invalid";

export function placeholderEmail(userId: AppId): string {
  return `lti-${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/**
 * Whether an address is a launch's stand-in rather than one a person has. No
 * page shows it as an address: it would read as a mailbox Carnap writes to.
 */
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** A linked platform that now asserts an address other than the account's. */
export interface EmailAlternative {
  readonly email: string;
  readonly identityId: AppId;
  /** The platform's registered name; null if it no longer exists. */
  readonly platformName: string | null;
}

/**
 * Who owns an account's address, put the way a page says it: the profile's
 * "From Moodle" and the admin record's source line read this, never the raw
 * columns, so the two pages cannot describe one account differently.
 */
export interface EmailAuthority {
  /** The address, or null while the account holds only a launch's placeholder. */
  readonly email: string | null;
  readonly source: EmailSource;
  /**
   * For an `lti` source, the name of the platform the address came from; null
   * for the other sources, and for a platform that no longer exists.
   */
  readonly platformName: string | null;
  /**
   * Linked platforms whose last assertion differs from the account's address,
   * which the account holder may take instead. Under an `lti` source these are
   * platforms whose record the latest change has overtaken; under the others,
   * what the holder's LMS would have changed the address to.
   */
  readonly alternatives: readonly EmailAlternative[];
}

/**
 * A single-use link behind an address change. `confirm` goes to the address an
 * account holder asked to move to, and moves the account from `fromEmail` to
 * `toEmail` once opened. `undo` goes to the address a change moved an account
 * away from, and moves it back from `toEmail` to `fromEmail`, restoring the
 * source that address had; while one is pending, `fromEmail` is held for its
 * account. See `0034_email_change_tokens.sql`.
 */
export type EmailChangeTokenKind = "confirm" | "undo";

export interface EmailChangeToken {
  readonly kind: EmailChangeTokenKind;
  readonly userId: AppId;
  readonly fromEmail: string;
  readonly toEmail: string;
  /** For an undo, who owned the address it restores; null for a confirm. */
  readonly restoreSource: EmailSource | null;
  /** For an undo of an `lti` address, the platform it came from. */
  readonly restorePlatformId: AppId | null;
  readonly createdAt: Timestamp;
  readonly expiresAt: Timestamp;
}

export interface User {
  readonly id: AppId;
  readonly email: string;
  /**
   * When ownership of the address was proven — by a consumed native login
   * link or an LTI link-approval email. Null for addresses only ever
   * asserted by an LMS launch, and always null for placeholder addresses.
   */
  readonly emailVerifiedAt: Timestamp | null;
  /** Who owns the address; see {@link EmailSource}. */
  readonly emailSource: EmailSource;
  /**
   * The platform an `lti` address came from, kept after that platform is
   * unlinked because it remains where the address came from. Null for the
   * other sources.
   */
  readonly emailSourcePlatformId: AppId | null;
  readonly name: string | null;
  /**
   * The user's chosen interface language, as a BCP-47 tag. Null means "no
   * choice recorded", so the request's own cookie or `Accept-Language` decides —
   * which is why this is nullable rather than defaulted: a stored default would
   * be indistinguishable from a deliberate pick of the default.
   */
  readonly locale: string | null;
  /**
   * The identifier this person's institution knows them by — a registrar's
   * student number, not anything of ours. Only an LMS launch writes it, from
   * the `lis.person_sourcedid` claim and nothing else; nobody can type one,
   * here or on the profile form.
   *
   * "Student" is a deliberate simplification, decided rather than overlooked:
   * platforms send the claim for any launching person, so an instructor's row
   * holds their staff number under this name too. Every surface that shows the
   * value keeps the word — in a grade export every row is a student's, which
   * is the one place the value does its job — and a role-neutral rename would
   * buy a column migration and a CSV header break for no reader's benefit.
   *
   * That job: letting an instructor join a Carnap grade export to a roster
   * their institution produced, which an email address does poorly and our own
   * {@link User.id} cannot do at all. Null is the ordinary value — every
   * account that has never been launched into, and every platform that does not
   * share the claim.
   */
  readonly studentId: string | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly disabledAt: Timestamp | null;
}

/**
 * The longest name we store. It is the profile form's limit, and every other
 * writer honours it for one reason: a name that reaches the row without passing
 * that check is one the owner's next profile save would be refused for, leaving
 * them unable to save the page until they shorten a name they never typed.
 */
export const NAME_MAX_LENGTH = 200;

/**
 * A name as it should be stored: trimmed, with blank meaning absent.
 *
 * Shared rather than per-caller because a name arrives from two directions —
 * typed on the profile form, asserted by an LMS launch — and the two have to
 * agree, or {@link hasName} would answer differently depending on which one
 * wrote the row.
 */
export function normalizeName(
  name: string | null | undefined,
): string | null {
  if (name === null || name === undefined) {
    return null;
  }

  const trimmed = name.trim();

  return trimmed.length === 0 ? null : trimmed;
}

/**
 * A name as an LMS may assert it: {@link normalizeName}'s shape, plus a
 * {@link NAME_MAX_LENGTH} bound that drops rather than refuses.
 *
 * Over-long is left on the floor because nothing that long is a name. The limit
 * sits far past any real one, so what exceeds it is a platform's composed
 * display string or a concatenation bug, and the useful thing to keep of that is
 * nothing at all: the account comes out nameless, which is a state the profile
 * prompt already exists to repair. Truncating would file two hundred characters
 * of the same junk under a person's name in every roster and grade export.
 *
 * Separate from {@link normalizeName} rather than folded into it because the two
 * sources want opposite answers to the same length. A name typed on the profile
 * form is refused with a message, since someone is there to read it and shorten
 * it; a launch has nobody to tell. Shape is shared, and the policy for over-long
 * belongs to the source.
 *
 * The bound lives here rather than at the adopter so that every route an
 * asserted name reaches the column by is bounded by construction — a launch that
 * adopts onto an existing account, and one that creates the account, which never
 * passes an adopter at all. Storing it unbounded is the defect this closes:
 * `assertName` then refuses the stored value, so the account's owner cannot save
 * their profile page until they shorten a name they never wrote.
 */
export function normalizeAssertedName(
  name: string | null | undefined,
): string | null {
  const normalized = normalizeName(name);

  return normalized === null || normalized.length > NAME_MAX_LENGTH
    ? null
    : normalized;
}

/**
 * Whether this user has a name to go by.
 *
 * Blank and absent are the same answer, which is why this is a function and not
 * a `!== null`: a name is free text off a form, so `"   "` reaches the row as
 * readily as null does and would display as an empty space where a person
 * should be. Two callers depend on agreeing about it — every list that falls
 * back to an email address, and the prompt that offers to fix that.
 *
 * It is a type predicate because one caller renders `user.email` behind it. The
 * cost is that a false branch narrows the argument to `never`: to ask this
 * question without giving up the value, compare {@link normalizeName} instead.
 */
export function hasName(user: User | null): user is User {
  return user !== null && (user.name?.trim().length ?? 0) > 0;
}

/**
 * The longest student ID we store.
 *
 * No form imposes this one — nothing on the site can type a student ID — so it
 * is a sanity bound on what a platform may assert, and the reason an over-long
 * value is dropped rather than truncated: a truncated institutional ID still
 * looks like an ID in a grade export, and joins against the wrong row or none
 * at all without ever saying it was cut.
 */
export const STUDENT_ID_MAX_LENGTH = 200;

/**
 * A student ID as it should be stored, or null when there is nothing storable:
 * trimmed, with both blank and over-{@link STUDENT_ID_MAX_LENGTH} meaning
 * absent.
 *
 * Blank is worth normalizing even though only a platform writes this field:
 * an LMS with the claim configured but the value unset sends `""` or a space
 * rather than omitting it, and a stored `""` would read as "this account has
 * an ID" everywhere that asks.
 *
 * The length test lives here rather than at the caller, as
 * {@link normalizeAssertedName} does for a launch's name, so that every path a
 * value can reach the column by is bounded by construction. There is more than
 * one: a launch that finds an existing account adopts, and a launch that
 * creates one passes straight to the insert.
 */
export function normalizeStudentId(
  studentId: string | null | undefined,
): string | null {
  if (studentId === null || studentId === undefined) {
    return null;
  }

  const trimmed = studentId.trim();

  return trimmed.length === 0 || trimmed.length > STUDENT_ID_MAX_LENGTH
    ? null
    : trimmed;
}

export interface ExternalIdentity {
  readonly id: AppId;
  readonly userId: AppId;
  readonly provider: ExternalIdentityProvider;
  readonly providerSubject: string;
  /**
   * For an LTI identity, the last address its platform asserted — adopted or
   * not, since an account whose holder chose their own address still wants to
   * know what the LMS says. Null until a launch records one, and always null
   * for a native identity, whose subject already is its address.
   */
  readonly assertedEmail: string | null;
  readonly createdAt: Timestamp;
}
