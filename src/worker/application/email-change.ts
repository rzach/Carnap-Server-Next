import { addSeconds, type Timestamp, timestampNow } from "../domain/time";
import {
  type EmailChangeToken,
  isPlaceholderEmail,
  type User,
} from "../domain/users";
import { deferred } from "../i18n/deferred";
import type { Translator } from "../i18n/translator";
import {
  type AuthenticatedActor,
  type AuthService,
  assertEmail,
  type MintedSession,
  normalizeEmail,
} from "./auth";
import { emailChangeRefusal, identityPlatformId } from "./email-authority";
import { AppHttpError, badRequest, forbidden } from "./errors";
import {
  createStoredLoginRateLimiter,
  type LoginRateLimiter,
} from "./login-rate-limit";
import type { AppStores } from "./stores";
import { createAuthToken, hashAuthToken } from "./tokens";

/**
 * How long the link that confirms a new address lives: a day, as an LMS link
 * approval does. It is asked for by someone signed in and waiting for it, but
 * the mailbox may be one they check at work.
 */
export const EMAIL_CHANGE_CONFIRM_TTL_SECONDS = 60 * 60 * 24;

/**
 * How long a change can be undone from the old address, and so how long that
 * address is held for its account: a week, long enough to cover someone who
 * reads that mailbox only now and then, short enough that an address someone
 * really gave up is soon free for another account.
 */
export const EMAIL_CHANGE_UNDO_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * The email sent to the address a change moved an account away from: what
 * happened, and — for any change but an administrator's — the way back.
 */
export interface EmailChangeNotice {
  /** The address the account left, which is where the notice goes. */
  readonly email: string;
  readonly newEmail: string;
  /**
   * Whether an administrator made the change. Such a change carries no undo:
   * it is how an account is recovered from a lost or taken mailbox, and an
   * undo would hand the account straight back to whoever holds it.
   */
  readonly byAdmin: boolean;
  /** The account holder's stored language, if any. */
  readonly locale: string | null;
  readonly undoToken: string | null;
}

/**
 * Sends {@link EmailChangeNotice}s. Best effort, and never throws: by the time
 * one is sent the change has happened, and a mail that fails must not turn it
 * into an error page. The implementation (`routes/email-change.ts`) builds the
 * link and sends after the response where the host allows.
 */
export interface EmailChangeNotifier {
  notify(notice: EmailChangeNotice): Promise<void>;
}

/** The mail behind {@link EmailChangeNotice}, as a sender's copy reads it. */
export interface SendEmailChangeNoticeInput {
  readonly byAdmin: boolean;
  readonly email: string;
  readonly expiresInSeconds: number;
  readonly i18n: Translator;
  readonly locale: string;
  readonly newEmail: string;
  /**
   * The undo link; null for an administrator's change, and for a change made
   * while an earlier one's undo is still pending (which then covers both).
   */
  readonly undoUrl: string | null;
}

/**
 * The mail sent instead of a confirmation link when the address asked for is
 * one another account uses: the same request gets the same reply on the page
 * either way, and only the mailbox's holder learns which it was.
 */
export interface SendEmailTakenInput {
  readonly email: string;
  readonly i18n: Translator;
  readonly locale: string;
}

/**
 * Tell the address an account just left, unless there is nobody to tell: a
 * launch's placeholder is no mailbox, and without a notifier there is no way
 * to send. An `undoable` change also records the undo the notice carries,
 * which holds the old address for the account until it is used or expires;
 * without a notice to carry it there is no undo, and nothing is held.
 *
 * Unless the account already has one pending: the change carried that
 * forward, and it puts back the address the earliest change took away. This
 * notice then goes without a link of its own, since a second change must not
 * hand whoever made it — and holds this mailbox — a fresh way back.
 */
export async function announceEmailChange(
  options: {
    readonly notifier: EmailChangeNotifier | null;
    readonly stores: AppStores;
  },
  change: {
    readonly before: User;
    readonly after: User;
    readonly undoable: boolean;
    readonly at: Date;
  },
): Promise<void> {
  const { after, at, before, undoable } = change;

  if (options.notifier === null || isPlaceholderEmail(before.email)) {
    return;
  }

  let undoToken: string | null = null;

  if (undoable) {
    const token = createAuthToken("aemu");
    const created = await options.stores.emailChanges.create({
      createdAt: timestampNow(at),
      expiresAt: addSeconds(at, EMAIL_CHANGE_UNDO_TTL_SECONDS),
      fromEmail: before.email,
      kind: "undo",
      restorePlatformId: before.emailSourcePlatformId,
      restoreSource: before.emailSource,
      toEmail: after.email,
      tokenHash: await hashAuthToken(token),
      userId: before.id,
    });

    undoToken = created === null ? null : token;
  }

  await options.notifier.notify({
    byAdmin: !undoable,
    email: before.email,
    locale: after.locale,
    newEmail: after.email,
    undoToken,
  });
}

export interface RequestEmailChangeInput {
  readonly email: string;
  readonly ipAddress: string | null;
}

/**
 * What a request to move to a new address sends: a confirmation link, or —
 * when another account uses the address, or one is held for it — a mail
 * saying so. The requester is told the same either way.
 */
export type RequestedEmailChange =
  | {
      readonly kind: "confirm";
      readonly email: string;
      readonly locale: string | null;
      readonly token: string;
    }
  | {
      readonly kind: "taken";
      readonly email: string;
      /** The language of the account the address belongs or is held for. */
      readonly locale: string | null;
    };

/** What a confirmation link's page describes. */
export interface PendingEmailChange {
  /** The address the account holds now; null while it holds a placeholder. */
  readonly fromEmail: string | null;
  readonly toEmail: string;
}

/** What an undo link's page describes. */
export interface PendingEmailUndo {
  readonly changedAt: Timestamp;
  /** The address the change moved the account to. */
  readonly currentEmail: string;
  /** The address undoing it puts back. */
  readonly restoreEmail: string;
}

export interface EmailChangeServiceOptions {
  readonly auth: AuthService;
  /** As `AuthService`'s: omitting it means the real limiter, never none. */
  readonly loginRateLimiter?: LoginRateLimiter;
  readonly notifier: EmailChangeNotifier | null;
  readonly now?: () => Date;
  readonly stores: AppStores;
}

function invalidEmailLink(): AppHttpError {
  return badRequest(
    "invalid_email_link",
    deferred.i18n.t("That link has expired or has already been used."),
  );
}

/**
 * The changes an account holder makes to their own address, and the undo that
 * follows every change a holder or their LMS makes.
 *
 * A change the holder types is proven before it happens: the link goes to the
 * new address, and the address changes when it is opened. A change the holder
 * picks from what their LMS asserts is not — the platform vouches for it, as
 * it does at every launch — which is why every change but an administrator's
 * also sends the old address a way back.
 */
export class EmailChangeService {
  private readonly loginRateLimiter: LoginRateLimiter;

  constructor(private readonly options: EmailChangeServiceOptions) {
    this.loginRateLimiter =
      options.loginRateLimiter ??
      createStoredLoginRateLimiter(
        options.now === undefined
          ? { auth: options.stores.auth }
          : { auth: options.stores.auth, now: options.now },
      );
  }

  /**
   * Ask to move the actor's account to `input.email`. Throttled as login
   * links are, on the address and the client: this too makes Carnap mail an
   * address its caller chose.
   */
  async request(
    actor: AuthenticatedActor,
    input: RequestEmailChangeInput,
  ): Promise<RequestedEmailChange> {
    const email = normalizeEmail(input.email);

    assertEmail(email);

    if (email === actor.user.email) {
      throw badRequest(
        "email_unchanged",
        deferred.i18n.t("That is already your address."),
      );
    }

    await this.loginRateLimiter.check({
      email,
      ipAddress: input.ipAddress,
      turnstileVerified: false,
    });

    const nowDate = this.nowDate();
    const now = timestampNow(nowDate);
    const { emailChanges, users } = this.options.stores;
    const holder = await users.getByEmail(email);

    if (holder !== null && holder.id !== actor.user.id) {
      return { email, kind: "taken", locale: holder.locale };
    }

    const held = await emailChanges.findPendingUndo(email, now);

    // The mailbox belongs, until the undo lapses, to the account it holds the
    // address for, so the mail is written in that account's language.
    if (held !== null && held.userId !== actor.user.id) {
      const keeper = await users.getById(held.userId);

      return { email, kind: "taken", locale: keeper?.locale ?? null };
    }

    const token = createAuthToken("aemc");

    await emailChanges.create({
      createdAt: now,
      expiresAt: addSeconds(nowDate, EMAIL_CHANGE_CONFIRM_TTL_SECONDS),
      fromEmail: actor.user.email,
      kind: "confirm",
      restorePlatformId: null,
      restoreSource: null,
      toEmail: email,
      tokenHash: await hashAuthToken(token),
      userId: actor.user.id,
    });

    return { email, kind: "confirm", locale: actor.user.locale, token };
  }

  /** Withdraw a confirmation link whose email could not be sent. */
  async withdraw(token: string): Promise<void> {
    await this.options.stores.emailChanges.delete(await hashAuthToken(token));
  }

  async describeConfirmation(token: string): Promise<PendingEmailChange> {
    const pending = await this.pending(token, "confirm");

    return {
      fromEmail: isPlaceholderEmail(pending.fromEmail)
        ? null
        : pending.fromEmail,
      toEmail: pending.toEmail,
    };
  }

  /**
   * Open a confirmation link: the new mailbox is proven, so the address moves
   * to it — the holder's own choice now, verified, and no launch's to change —
   * and the opener is signed in, as a login link to that address would.
   */
  async confirm(token: string): Promise<MintedSession> {
    const nowDate = this.nowDate();
    const now = timestampNow(nowDate);
    const pending = await this.consume(token, "confirm", now);
    const before = await this.accountFor(pending);
    const after = await this.options.stores.users.changeEmail(before.id, {
      from: pending.fromEmail,
      to: pending.toEmail,
      source: "user",
      sourcePlatformId: null,
      verifiedAt: now,
      updatedAt: now,
      pendingUndo: "carry",
    });

    if (after === null) {
      throw await emailChangeRefusal(
        this.options.stores,
        before.id,
        pending.toEmail,
        now,
      );
    }

    await this.announce(before, after, nowDate);

    return this.options.auth.mintSession(after);
  }

  async describeUndo(token: string): Promise<PendingEmailUndo> {
    const pending = await this.pending(token, "undo");

    return {
      changedAt: pending.createdAt,
      currentEmail: pending.toEmail,
      restoreEmail: pending.fromEmail,
    };
  }

  /**
   * Open an undo link: put the old address back, owned as it was before, and
   * proven by this very click; then sign the account out everywhere and in
   * here. The sign-out is the point when the change was someone else's doing.
   */
  async undo(token: string): Promise<MintedSession> {
    const nowDate = this.nowDate();
    const now = timestampNow(nowDate);
    const pending = await this.consume(token, "undo", now);
    const account = await this.accountFor(pending);
    const restored = await this.options.stores.users.changeEmail(account.id, {
      from: pending.toEmail,
      to: pending.fromEmail,
      source: pending.restoreSource ?? "user",
      sourcePlatformId: pending.restorePlatformId,
      verifiedAt: now,
      updatedAt: now,
      pendingUndo: "cancel",
    });

    if (restored === null) {
      throw await emailChangeRefusal(
        this.options.stores,
        account.id,
        pending.fromEmail,
        now,
      );
    }

    await this.options.stores.auth.revokeSessionsForUser(restored.id, now);

    return this.options.auth.mintSession(restored);
  }

  /**
   * Hand the actor's address back to one of their LMSs: take the address that
   * platform last asserted, and let its launches change it from now on.
   *
   * No confirmation email, unlike a change the holder types: the address is
   * one a registered platform vouches for, which is the trust every launch
   * already extends, and the holder is signed in and asking for it. It lands
   * unverified for the same reason a launch's does — and the old address gets
   * the undo, since nothing proved that the new one is a mailbox they can read.
   */
  async useLmsEmail(
    actor: AuthenticatedActor,
    identityId: string,
  ): Promise<User> {
    const { stores } = this.options;
    const identities = await stores.users.listExternalIdentitiesForUser(
      actor.user.id,
    );
    const identity = identities.find(
      (entry) => entry.id === identityId && entry.provider === "lti",
    );

    if (identity === undefined) {
      throw new AppHttpError(
        404,
        "identity_not_found",
        deferred.i18n.t("The linked identity was not found on your account."),
      );
    }

    const asserted = identity.assertedEmail;

    if (asserted === null || asserted === actor.user.email) {
      throw badRequest(
        "email_unchanged",
        deferred.i18n.t("That LMS has no different address for you."),
      );
    }

    const nowDate = this.nowDate();
    const now = timestampNow(nowDate);
    const changed = await stores.users.changeEmail(actor.user.id, {
      from: actor.user.email,
      to: asserted,
      source: "lti",
      sourcePlatformId: identityPlatformId(identity),
      verifiedAt: null,
      updatedAt: now,
      pendingUndo: "carry",
    });

    if (changed === null) {
      throw await emailChangeRefusal(stores, actor.user.id, asserted, now);
    }

    await this.announce(actor.user, changed, nowDate);

    return changed;
  }

  private announce(before: User, after: User, at: Date): Promise<void> {
    return announceEmailChange(this.options, {
      after,
      at,
      before,
      undoable: true,
    });
  }

  private async pending(
    token: string,
    kind: EmailChangeToken["kind"],
  ): Promise<EmailChangeToken> {
    const pending =
      token.length === 0
        ? null
        : await this.options.stores.emailChanges.get(
            await hashAuthToken(token),
            kind,
            timestampNow(this.nowDate()),
          );

    if (pending === null) {
      throw invalidEmailLink();
    }

    return pending;
  }

  private async consume(
    token: string,
    kind: EmailChangeToken["kind"],
    now: Timestamp,
  ): Promise<EmailChangeToken> {
    const pending =
      token.length === 0
        ? null
        : await this.options.stores.emailChanges.consume(
            await hashAuthToken(token),
            kind,
            now,
          );

    if (pending === null) {
      throw invalidEmailLink();
    }

    return pending;
  }

  /**
   * The account a used link belongs to. A suspended one is refused here,
   * after the link is spent rather than before: the change would leave it
   * signed out and unchanged-looking, and a suspension is an administrator's
   * to lift, not a link's to get around.
   */
  private async accountFor(pending: EmailChangeToken): Promise<User> {
    const user = await this.options.stores.users.getById(pending.userId);

    if (user === null) {
      throw invalidEmailLink();
    }

    if (user.disabledAt !== null) {
      throw forbidden("disabled_user");
    }

    return user;
  }

  private nowDate(): Date {
    return this.options.now?.() ?? new Date();
  }
}
