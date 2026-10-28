import type { Context } from "hono";

import type { CalendarFeedContents } from "../application/calendar";
import { type Timestamp, timestampNow } from "../domain/time";
import { type AppBindings, publicRequestUrl } from "../http";
import { i18nFor } from "../i18n";
import { isSupportedLocale } from "../i18n/locales";

/** One due date, as a calendar event. */
export interface CalendarEvent {
  readonly description: string;
  readonly start: Timestamp;
  readonly summary: string;
  /** Globally unique and stable, so a client updates an event in place. */
  readonly uid: string;
  readonly url: string;
}

/**
 * An iCalendar document (RFC 5545) of the given events, each a moment rather
 * than a span: a due date has a start and no length, which the format spells
 * as a DTSTART with no DTEND or DURATION.
 */
export function calendarDocument(options: {
  readonly events: readonly CalendarEvent[];
  readonly name: string;
  readonly now: Timestamp;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Carnap//Due dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
    ...options.events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${utcDateTime(options.now)}`,
      `DTSTART:${utcDateTime(event.start)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `URL:${event.url}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/**
 * A user's feed, in their own language when their account records one: no
 * browser asks for it, so the request's language is a calendar app's, if any.
 */
export function renderCalendarFeed(
  context: Context<AppBindings>,
  contents: CalendarFeedContents,
): Response {
  const stored = contents.user.locale;
  const i18n =
    stored !== null && isSupportedLocale(stored)
      ? i18nFor(stored)
      : context.get("i18n");
  const origin = publicRequestUrl(context).origin;
  const host = new URL(origin).host;
  const body = calendarDocument({
    events: contents.entries.map(({ assignment, course, dueAt }) => {
      const url = `${origin}/courses/${course.id}/assignments/${assignment.id}`;

      return {
        // The link again, for the clients that do not show an event's URL.
        description: `${course.title}\n${url}`,
        start: dueAt,
        summary: i18n.t("{assignment} ({course})", {
          assignment: assignment.title,
          course: course.title,
        }),
        uid: `${assignment.id}@${host}`,
        url,
      };
    }),
    name: i18n.t("Carnap due dates"),
    now: timestampNow(),
  });

  return new Response(body, {
    headers: {
      // Private: the address is the credential, so no shared cache may keep
      // the answer. A calendar app polls on its own schedule anyway.
      "Cache-Control": "private, no-cache",
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}

/** `2026-10-28T23:59:00.000Z` as iCalendar's UTC form, `20261028T235900Z`. */
function utcDateTime(value: Timestamp): string {
  return `${value.slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** TEXT escaping: backslash, semicolon, comma, and line breaks. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const MAX_LINE_OCTETS = 75;

/**
 * Fold a content line into lines of at most 75 octets, each continuation
 * opening with a space. Octets, not characters, and never inside one: a
 * title in Greek or with an accent must not be cut through a UTF-8 sequence.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;
    // A continuation's leading space is one of its 75.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;

    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }

    current += character;
    octets += size;
  }

  parts.push(current);

  return parts.join("\r\n ");
}
