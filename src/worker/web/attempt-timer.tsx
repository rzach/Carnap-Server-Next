import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { submissionCutoff } from "../application/policies";
import type { Attempt } from "../domain/assessment";
import type { Assignment } from "../domain/assignments";
import type { Timestamp } from "../domain/time";
import { splitAtValue, VALUE } from "../i18n/translator";
import { Time } from "./components";
import { useI18n } from "./i18n-context";
import { CloseIcon, PinIcon, StopwatchIcon } from "./icons";
import {
  ATTEMPT_TIMER_UI_STRINGS_ATTRIBUTE,
  attemptTimerUiStrings,
  uiStringsScript,
} from "./ui-strings";

/**
 * When the timer counts down to, or null when there is no timer: only a timed
 * attempt counts down. One that is not timed still stops at the assignment's
 * close, but that is a date like the due date, not a clock running against
 * the student.
 */
export function timedAttemptEnd(
  assignment: Assignment,
  attempt: Attempt | null,
): Timestamp | null {
  return attempt === null || attempt.expiresAt === null
    ? null
    : submissionCutoff(assignment, attempt);
}

/**
 * When a timed attempt's time runs out, and — once the script has started it
 * (`ATTEMPT_TIMER_SCRIPT` in `./assignment-scripts.ts`) — how long is left.
 *
 * It sits at the end of the assignment page's attempt line and, where there is
 * no attempt line, at the top of the content document standing on its own: an
 * LMS launch lands there, and so does the content's fullscreen link. Inside
 * our own frame the document leaves it out, since the line above the frame
 * already says it.
 *
 * Without the script it is only the end time. With it the count of what is
 * left follows, last on the line, in a pill: the count is a button that pins
 * the line holding it (the nearest `data-attempt-timer-line`) to the top of
 * the window, so it stays in sight down a long lesson, and a cross at the
 * pill's end hides the count, for a student whom a running clock distracts
 * more than it helps (WCAG 2.2.2: it is information that updates on its own).
 * Hidden, the pill gives way to a stopwatch in the same place, which brings it
 * back. The choice is kept in the browser, for the next page. Ten, five
 * and one minute before the end a polite status says so — the count itself
 * is not a live region, which would talk every minute — and in the last five
 * the count turns gold. When the time is up it says so, hidden or not.
 *
 * `endsAt` is when the server stops accepting answers, which is the attempt's
 * expiry or the assignment's close, whichever comes first. `now` is the
 * server's clock as it rendered the page: the count is measured on that clock,
 * not the reader's, which may be minutes out.
 */
export const AttemptTimer: FC<{
  readonly class?: string;
  readonly endsAt: Timestamp;
  readonly now: Timestamp;
}> = ({ class: className, endsAt, now }) => {
  const i18n = useI18n();
  const strings = attemptTimerUiStrings(i18n);
  const [endsBefore, endsAfter] = splitAtValue(
    i18n.t("Time ends {when}", { when: VALUE }),
  );

  return (
    <span
      class={
        className === undefined
          ? "attempt-timer"
          : `attempt-timer ${className}`
      }
      data-attempt-timer=""
      data-ends={endsAt}
      data-now={now}
    >
      <span>
        {endsBefore}
        <Time value={endsAt} />
        {endsAfter}
      </span>
      {/* One pill, two buttons: a button cannot hold another. */}
      <span class="attempt-timer-pill" data-attempt-timer-pill="" hidden>
        <button
          aria-pressed="false"
          class="attempt-timer-left"
          data-attempt-timer-pin=""
          title={strings.pin}
          type="button"
        >
          <span data-attempt-timer-text="" />
          <span class="visually-hidden">{strings.pin}</span>
          <PinIcon />
        </button>
        <button
          aria-label={strings.hide}
          class="attempt-timer-hide"
          data-attempt-timer-hide=""
          title={strings.hide}
          type="button"
        >
          <CloseIcon />
        </button>
      </span>
      <button
        aria-label={strings.show}
        class="attempt-timer-show"
        data-attempt-timer-show=""
        hidden
        title={strings.show}
        type="button"
      >
        <StopwatchIcon />
      </button>
      <span
        class="visually-hidden"
        data-attempt-timer-status=""
        role="status"
      />
      {raw(uiStringsScript(ATTEMPT_TIMER_UI_STRINGS_ATTRIBUTE, strings))}
    </span>
  );
};
