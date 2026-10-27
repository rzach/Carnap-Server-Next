import type { Child, FC } from "hono/jsx";
import type { UserDirectory } from "../application/users";
import { hasName, type User } from "../domain/users";
import type { Translator } from "../i18n/translator";
import { useI18n } from "./layout";

function shortId(id: string): string {
  return id.length <= 12 ? id : id.slice(0, 8);
}

/** The best single-line label for a user: name, else email, else a hint. */
export function userDisplayName(
  i18n: Translator,
  user: User | null,
  fallbackId: string,
): string {
  if (user === null) {
    return i18n.t("Unknown user {id}", { id: shortId(fallbackId) });
  }

  return user.name?.trim() || user.email;
}

/**
 * A secondary detail line to sit under {@link userDisplayName}: the email
 * under a name, or the full id of a user the directory has no record of.
 * Null for a user with no name, whose email is already the first line and
 * tells them apart on its own.
 */
export function userDisplayMeta(
  i18n: Translator,
  user: User | null,
  fallbackId: string,
): string | null {
  if (user === null) {
    return i18n.t("User ID {id}", { id: fallbackId });
  }

  return hasName(user) ? user.email : null;
}

/**
 * Render a user by id: their name (or email) with the email as a quiet
 * second line when a name is present. Never prints a raw id when a name or
 * email is known.
 *
 * `identified` adds the second line for a user the directory has no record
 * of — "User ID …" — for a ledger whose rows have to stay tellable apart.
 *
 * `badge` sits beside the name, on the first line, for a row's exceptional
 * state (see `StatusBadge`).
 */
export const UserLabel: FC<{
  readonly badge?: Child;
  readonly directory: UserDirectory;
  readonly identified?: boolean;
  readonly userId: string;
}> = ({ badge, directory, identified = false, userId }) => (
  <UserRecordLabel
    badge={badge}
    identified={identified}
    user={directory.get(userId) ?? null}
    userId={userId}
  />
);

/**
 * The line a {@link UserLabel} sets under the name — the address, or the
 * identifier that stands in for one — or null when it shows none.
 */
export function userDetail(
  i18n: Translator,
  user: User | null,
  userId: string,
  identified = false,
): string | null {
  const detail =
    identified || hasName(user) ? userDisplayMeta(i18n, user, userId) : null;

  return detail === userDisplayName(i18n, user, userId) ? null : detail;
}

/** {@link UserLabel} for a user record already in hand. */
export const UserRecordLabel: FC<{
  readonly badge?: Child;
  readonly identified?: boolean;
  readonly user: User | null;
  readonly userId: string;
}> = ({ badge, identified = false, user, userId }) => {
  const i18n = useI18n();
  const detail = userDetail(i18n, user, userId, identified);

  return (
    <>
      {userDisplayName(i18n, user, userId)}
      {badge === undefined ? null : <> {badge}</>}
      {detail === null ? null : (
        <>
          <br />
          <span class="small">{detail}</span>
        </>
      )}
    </>
  );
};
