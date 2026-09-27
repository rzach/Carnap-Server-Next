/**
 * The forms a timestamp is written in, each defined once.
 *
 * Browser scripts are strings built in TypeScript, so a format they share with
 * the server — or with each other — is interpolated from here rather than
 * spelled out again inside each one. Two spellings of one format are how the
 * same instant ends up written two ways on one page.
 */

/**
 * The reader's own clock: "Jul 6, 2026, 3:19 PM". What the shell writes into
 * every `<time>` element, and what the exercise status line writes in a
 * content document, which has no shell script to lean on.
 */
export const LOCAL_TIMESTAMP_FIELDS = {
  dateStyle: "medium",
  timeStyle: "short",
} as const satisfies Intl.DateTimeFormatOptions;

/**
 * A timestamp with its zone named: "Aug 6, 2026, 11:24 PM UTC".
 *
 * For text the server writes before any reader's zone is known — a revision
 * picker's option, the exercise status line's first paint — and so writes in
 * UTC, which it must then say. The picker's script rewrites its options in the
 * same fields and the reader's zone. To the minute, because the day alone
 * describes a revision without always telling two apart: an author who saves
 * twice before lunch and names neither would get two options reading alike.
 *
 * Spelled out field by field because `dateStyle`/`timeStyle` cannot be combined
 * with `timeZoneName`.
 */
export const ZONED_TIMESTAMP_FIELDS = {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZoneName: "short",
  year: "numeric",
} as const satisfies Intl.DateTimeFormatOptions;

/**
 * An instant to the minute in UTC, zone named — what a reader without
 * JavaScript keeps. Anything unparseable is returned as it came.
 */
export function utcTimestampText(timestamp: string, locale: string): string {
  const instant = new Date(timestamp);

  if (Number.isNaN(instant.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(locale, {
    ...ZONED_TIMESTAMP_FIELDS,
    timeZone: "UTC",
  }).format(instant);
}
