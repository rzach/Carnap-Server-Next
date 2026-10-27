import type { FC } from "hono/jsx";

import type {
  StudentAssignmentProgress,
  StudentScorecardEntry,
} from "../application/gradebook";
import {
  type Assignment,
  type AssignmentAvailability,
  assignmentAvailability,
} from "../domain/assignments";
import type { Timestamp } from "../domain/time";
import { splitAtValue, type Translator, VALUE } from "../i18n/translator";
import {
  ScoreLegend,
  StatusBadge,
  TableScroll,
  Time,
  UnscoredMark,
  type UnscoredMarkText,
} from "./components";
import { assessmentModeLabel } from "./labels";
import { useI18n } from "./layout";

/**
 * Where a student is with one assignment, in the words the course page shows.
 *
 * Plain text, and a colour only for the exceptions a student must not miss,
 * as the badge discipline asks of a status anywhere: graded work whose due
 * date has passed with nothing in (red), or with some of it unanswered (the
 * word "Incomplete" in gold, its count plain). Practice has no deadline that
 * costs anything, so its past due date changes nothing.
 */
type WorkStatus =
  | { readonly kind: "completed" }
  | {
      readonly answered: number;
      readonly kind: "in-progress" | "incomplete";
      readonly questions: number;
    }
  | { readonly kind: "not-started" | "not-submitted" };

function workStatus(
  assignment: Assignment,
  progress: StudentAssignmentProgress | undefined,
  now: Timestamp,
): WorkStatus | null {
  if (progress === undefined || progress.questions === 0) {
    return null;
  }

  if (progress.answered >= progress.questions) {
    return { kind: "completed" };
  }

  const overdue =
    assignment.assessmentMode === "graded" &&
    assignment.dueAt !== null &&
    assignment.dueAt <= now;

  if (progress.answered === 0) {
    return { kind: overdue ? "not-submitted" : "not-started" };
  }

  return {
    answered: progress.answered,
    kind: overdue ? "incomplete" : "in-progress",
    questions: progress.questions,
  };
}

const WorkStatusText: FC<{ readonly status: WorkStatus }> = ({ status }) => {
  const i18n = useI18n();

  switch (status.kind) {
    case "completed":
      return <>{i18n.t("Completed")}</>;
    case "in-progress":
      return (
        <>
          {i18n.t("In progress · {answered} of {questions}", {
            answered: status.answered,
            questions: status.questions,
          })}
        </>
      );
    case "incomplete": {
      // The word in gold, the count beside it plain: the word is the
      // exception, the count is the same as any other row's.
      const [before, after] = splitAtValue(
        i18n.t("{incomplete} · {answered} of {questions}", {
          answered: status.answered,
          incomplete: VALUE,
          questions: status.questions,
        }),
      );

      return (
        <>
          {before}
          <span class="work-status-warn">{i18n.t("Incomplete")}</span>
          {after}
        </>
      );
    }
    case "not-started":
      return <>{i18n.t("Not started")}</>;
    case "not-submitted":
      return (
        <span class="work-status-danger">{i18n.t("Nothing submitted")}</span>
      );
  }
};

/**
 * The three groups the list falls into, by the date the student is held to:
 * work due ahead (or not open yet), work whose date has gone, and work with no
 * date at all. Every kind of item goes by its date, practice and readings
 * included — an instructor who dates a reading means it to be read by then,
 * and a reading sorted to the bottom for being a reading would be missed.
 */
type ScheduleGroup = "upcoming" | "past" | "unscheduled";

function scheduleGroup(
  assignment: Assignment,
  now: Timestamp,
): ScheduleGroup {
  if (assignment.dueAt !== null) {
    return assignment.dueAt > now ? "upcoming" : "past";
  }

  // With no due date, the window says which side of now an item is on.
  const availability = assignmentAvailability(assignment, now);

  return availability === "upcoming"
    ? "upcoming"
    : availability === "closed"
      ? "past"
      : "unscheduled";
}

function scheduleGroupLabel(i18n: Translator, group: ScheduleGroup): string {
  switch (group) {
    case "upcoming":
      return i18n.t("Upcoming");
    case "past":
      return i18n.t("Past");
    case "unscheduled":
      return i18n.t("No due date");
  }
}

/**
 * Each group in reading order: the soonest due first among what is ahead, the
 * most recent first among what is behind, and the instructor's own order for
 * the undated. The sort is stable, so the instructor's order also breaks ties
 * between items due at the same moment.
 */
function scheduledGroups(
  assignments: readonly Assignment[],
  now: Timestamp,
): { readonly group: ScheduleGroup; readonly rows: Assignment[] }[] {
  const by = (group: ScheduleGroup) =>
    assignments.filter(
      (assignment) => scheduleGroup(assignment, now) === group,
    );
  const upcoming = by("upcoming").sort((left, right) =>
    compareText(
      left.dueAt ?? left.availableFrom ?? "",
      right.dueAt ?? right.availableFrom ?? "",
    ),
  );
  const past = by("past").sort((left, right) =>
    compareText(
      right.dueAt ?? right.availableUntil ?? "",
      left.dueAt ?? left.availableUntil ?? "",
    ),
  );

  return [
    { group: "upcoming" as const, rows: upcoming },
    { group: "past" as const, rows: past },
    { group: "unscheduled" as const, rows: by("unscheduled") },
  ].filter(({ rows }) => rows.length > 0);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * What a student's title carries besides the title: nothing while the
 * assignment is open, which is the ordinary case, and a badge only for the
 * exception — "Closed" for work past its cutoff (the row lingers, greyed, for
 * reference) and "Opens <date>" for work not yet available.
 */
const AvailabilityBadge: FC<{
  readonly assignment: Assignment;
  readonly state: AssignmentAvailability;
}> = ({ assignment, state }) => {
  const i18n = useI18n();

  if (state === "upcoming") {
    const [before, after] = splitAtValue(
      i18n.t("Opens {when}", { when: VALUE }),
    );

    return (
      <>
        {" "}
        <StatusBadge
          label={
            <>
              {before}
              <Time value={assignment.availableFrom} />
              {after}
            </>
          }
          tone="warn"
        />
      </>
    );
  }

  if (state === "closed") {
    return (
      <>
        {" "}
        <StatusBadge
          label={i18n.t(
            "Closed (assignment availability)",
            {},
            {
              comment:
                "Disambiguating id; only the word Closed is shown. A badge beside an assignment past its closing date.",
              message: "Closed",
            },
          )}
        />
      </>
    );
  }

  return null;
};

/** The mark an unreleased score shows in place of its points. */
function unreleasedMark(i18n: Translator): UnscoredMarkText {
  return { label: i18n.t("Score not released yet"), mark: "—" };
}

/**
 * A student's score cell: earned over worth, linked to the results page. A
 * graded score not yet released keeps its worth and shows a dash for the
 * points, which the legend under the table explains once; practice scores show
 * at once, muted, since they reach no total. Nothing at all where nothing is
 * scored — a reading, or practice not yet touched.
 */
const ScoreCell: FC<{
  readonly assignmentId: string;
  readonly courseId: string;
  readonly entry: StudentScorecardEntry | undefined;
}> = ({ assignmentId, courseId, entry }) => {
  const i18n = useI18n();
  const href = `/courses/${courseId}/assignments/${assignmentId}/results`;

  if (entry === undefined) {
    return null;
  }

  if (!entry.counts) {
    return (
      <a class="score-uncounted" href={href}>
        {entry.earned}/{entry.worth}
      </a>
    );
  }

  if (!entry.released) {
    return (
      <>
        <UnscoredMark {...unreleasedMark(i18n)} />/{entry.worth}
      </>
    );
  }

  return (
    <a href={href}>
      {entry.earned}/{entry.worth}
    </a>
  );
};

/**
 * A due date as a student plans by it: the weekday, the date, and how far off
 * it is while that is near — to the minute while it is ahead, since that is
 * when the work is due; once it has passed the day says enough. A faint dash
 * where there is none.
 */
const DueDate: FC<{
  readonly ahead: boolean;
  readonly value: Timestamp | null;
}> = ({ ahead, value }) =>
  value === null ? (
    <span class="table-empty">—</span>
  ) : (
    <Time day={!ahead} relative value={value} weekday />
  );

const StudentAssignmentRow: FC<{
  readonly assignment: Assignment;
  readonly courseId: string;
  readonly now: Timestamp;
  readonly progress: StudentAssignmentProgress | undefined;
  readonly score: StudentScorecardEntry | undefined;
}> = ({ assignment, courseId, now, progress, score }) => {
  const i18n = useI18n();
  // Only "open" assignments are reachable — the detail page stays gated
  // before an assignment opens and after it closes, by the same reading of
  // the window — so upcoming and closed rows render their title as plain
  // text rather than a dead link.
  const state = assignmentAvailability(assignment, now);
  const status = workStatus(assignment, progress, now);

  return (
    <tr class={state === "closed" ? "assignment-closed" : undefined}>
      <td>
        {state === "open" ? (
          <a href={`/courses/${courseId}/assignments/${assignment.id}`}>
            {assignment.title}
          </a>
        ) : (
          assignment.title
        )}
        <AvailabilityBadge assignment={assignment} state={state} />
      </td>
      <td>{assessmentModeLabel(i18n, assignment.assessmentMode)}</td>
      <td>
        <DueDate
          ahead={assignment.dueAt !== null && assignment.dueAt > now}
          value={assignment.dueAt}
        />
      </td>
      <td>{status === null ? null : <WorkStatusText status={status} />}</td>
      <td class="numeric">
        <ScoreCell
          assignmentId={assignment.id}
          courseId={courseId}
          entry={score}
        />
      </td>
    </tr>
  );
};

/**
 * A student's cumulative course total, summed over the released graded
 * assignments — the same entries whose earned/worth cells are visible above —
 * with the share it comes to. Unreleased grades are withheld from the running
 * total just as they are from the per-assignment cells. Renders nothing until
 * at least one grade is released, so the footer stays quiet early in a term.
 */
const StudentTotalFooter: FC<{
  readonly scores: readonly StudentScorecardEntry[];
}> = ({ scores }) => {
  const i18n = useI18n();
  let earned = 0;
  let possible = 0;
  let released = 0;

  for (const entry of scores) {
    if (!entry.counts || !entry.released || entry.earned === null) {
      continue;
    }

    earned += entry.earned;
    possible += entry.worth;
    released += 1;
  }

  if (released === 0) {
    return null;
  }

  return (
    <tfoot>
      <tr>
        <td colspan={4}>
          <strong>{i18n.t("Course total")}</strong>
        </td>
        <td class="numeric">
          <strong>
            {possible === 0
              ? `${earned}/${possible}`
              : i18n.t("{earned}/{possible} · {percent}%", {
                  earned,
                  percent: Math.round((earned / possible) * 100),
                  possible,
                })}
          </strong>
        </td>
      </tr>
    </tfoot>
  );
};

/**
 * The student's list of a course's assignments, grouped by date (see
 * {@link scheduledGroups}), each row with where they are with it.
 *
 * Not sortable, unlike the staff's list: the grouping is the order, and a
 * column sort would interleave the groups again.
 */
export const StudentAssignmentsTable: FC<{
  readonly assignments: readonly Assignment[];
  readonly courseId: string;
  readonly now: Timestamp;
  readonly progress: readonly StudentAssignmentProgress[];
  readonly scores: readonly StudentScorecardEntry[];
}> = ({ assignments, courseId, now, progress, scores }) => {
  const i18n = useI18n();

  if (assignments.length === 0) {
    return <p>{i18n.t("No assignments are available.")}</p>;
  }

  const scoreByAssignment = new Map(
    scores.map((entry) => [entry.assignmentId, entry]),
  );
  const progressByAssignment = new Map(
    progress.map((entry) => [entry.assignmentId, entry]),
  );
  const shown = new Set(assignments.map((assignment) => assignment.id));
  const shownScores = scores.filter((entry) => shown.has(entry.assignmentId));
  const legend = shownScores.some((entry) => entry.counts && !entry.released)
    ? [unreleasedMark(i18n)]
    : [];

  return (
    <>
      <TableScroll phoneList>
        <thead>
          <tr>
            <th scope="col">{i18n.t("Title")}</th>
            <th scope="col">{i18n.t("Type")}</th>
            <th scope="col">{i18n.t("Due")}</th>
            <th scope="col">{i18n.t("Status")}</th>
            <th class="numeric" scope="col">
              {i18n.t("Score")}
            </th>
          </tr>
        </thead>
        {scheduledGroups(assignments, now).map(({ group, rows }) => (
          <tbody>
            <tr class="table-group">
              <th colspan={5} scope="rowgroup">
                {scheduleGroupLabel(i18n, group)}
              </th>
            </tr>
            {rows.map((assignment) => (
              <StudentAssignmentRow
                assignment={assignment}
                courseId={courseId}
                now={now}
                progress={progressByAssignment.get(assignment.id)}
                score={scoreByAssignment.get(assignment.id)}
              />
            ))}
          </tbody>
        ))}
        <StudentTotalFooter scores={shownScores} />
      </TableScroll>
      <ScoreLegend marks={legend} />
      {shownScores.some((entry) => !entry.counts) ? (
        <p class="small muted">
          {i18n.t("Practice scores do not count toward the course total.")}
        </p>
      ) : null}
    </>
  );
};
