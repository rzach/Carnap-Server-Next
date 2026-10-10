import type { AppId } from "../domain/ids";
import { parseLtiProviderSubject } from "../domain/lti";
import type { Timestamp } from "../domain/time";
import {
  type EmailAuthority,
  type ExternalIdentity,
  isPlaceholderEmail,
  type User,
} from "../domain/users";
import { deferred } from "../i18n/deferred";
import { type AppHttpError, badRequest } from "./errors";
import type { AppStores } from "./stores";

/** The platform each LTI identity names, or null for a native one. */
export function identityPlatformId(identity: ExternalIdentity): AppId | null {
  return identity.provider === "lti"
    ? (parseLtiProviderSubject(identity.providerSubject)?.platformId ?? null)
    : null;
}

/**
 * The registered names of the given platforms, one read per platform: an
 * account holds one or two. A platform that no longer exists has no entry.
 */
export async function platformNames(
  stores: AppStores,
  platformIds: Iterable<AppId | null>,
): Promise<Map<AppId, string>> {
  const ids = [...new Set(platformIds)].filter(
    (id): id is AppId => id !== null,
  );
  const platforms = await Promise.all(
    ids.map((id) => stores.lti.getPlatformById(id)),
  );

  return new Map(
    platforms.flatMap((platform) =>
      platform === null ? [] : [[platform.id, platform.name] as const],
    ),
  );
}

/** Describe who owns `user`'s address, from rows the caller has read. */
export function emailAuthority(
  user: User,
  identities: readonly ExternalIdentity[],
  names: ReadonlyMap<AppId, string>,
): EmailAuthority {
  const nameOf = (id: AppId | null) =>
    id === null ? null : (names.get(id) ?? null);

  return {
    alternatives: identities.flatMap((identity) =>
      identity.provider !== "lti" ||
      identity.assertedEmail === null ||
      identity.assertedEmail === user.email
        ? []
        : [
            {
              email: identity.assertedEmail,
              identityId: identity.id,
              platformName: nameOf(identityPlatformId(identity)),
            },
          ],
    ),
    email: isPlaceholderEmail(user.email) ? null : user.email,
    platformName:
      user.emailSource === "lti" ? nameOf(user.emailSourcePlatformId) : null,
    source: user.emailSource,
  };
}

/** Read and describe who owns `user`'s address. */
export async function loadEmailAuthority(
  stores: AppStores,
  user: User,
  identities: readonly ExternalIdentity[],
): Promise<EmailAuthority> {
  const names = await platformNames(stores, [
    user.emailSourcePlatformId,
    ...identities.map(identityPlatformId),
  ]);

  return emailAuthority(user, identities, names);
}

/**
 * Why a change the store refused did not happen, read from the state it left:
 * another account holds the address it aimed at, or a pending undo holds it
 * for the account that left it, or neither — in which case the account's own
 * address moved between the caller's read and its write.
 *
 * Only for a change made by someone entitled to know where an address stands:
 * the holder of the account or of the mailbox concerned, or an administrator.
 * A route an anonymous caller can reach with an address of their choosing must
 * not answer differently by whether that address has an account.
 */
export async function emailChangeRefusal(
  stores: AppStores,
  userId: AppId,
  to: string,
  now: Timestamp,
): Promise<AppHttpError> {
  const holder = await stores.users.getByEmail(to);

  if (holder !== null && holder.id !== userId) {
    return badRequest(
      "email_taken",
      deferred.i18n.t("Another Carnap account already uses that address."),
    );
  }

  const held = await stores.emailChanges.findPendingUndo(to, now);

  if (held !== null && held.userId !== userId) {
    return badRequest(
      "email_held",
      deferred.i18n.t(
        "That address was recently moved off another Carnap account, and is kept for it while the change can still be undone.",
      ),
    );
  }

  return badRequest(
    "email_changed",
    deferred.i18n.t(
      "The address changed while this page was open. Reload it and try again.",
    ),
  );
}
