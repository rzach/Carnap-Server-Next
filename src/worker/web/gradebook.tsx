import type { Context } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";

import type {
  AssignmentGradebook,
  CourseGradebook,
  GradebookExercise,
  StudentScorecardEntry,
} from "../application/gradebook";
import type {
  StudentAssignmentResults,
  SubmissionHistoryEntry,
} from "../application/submissions";
import {
  storedPointsDrift,
  type ViewerEvaluation,
} from "../domain/assessment";
import type { CourseStaffTier } from "../domain/courses";
import { type AssignmentScore, roundPoints } from "../domain/grades";
import type { User } from "../domain/users";
import type { AppBindings } from "../http";
import { splitAtValue, type Translator, VALUE } from "../i18n/translator";
import { reviewQueryString } from "./assignment-detail";
import {
  courseCrumb,
  coursesCrumb,
  staffAssignmentCrumb,
  studentAssignmentCrumb,
} from "./breadcrumbs";
import {
  AnswerReview,
  LinkStrip,
  Notice,
  PointsDriftNote,
  Sheet,
  type SummaryItem,
  SummaryStrip,
  TableScroll,
  Time,
} from "./components";
import { renderShell, useI18n } from "./layout";
import { SortHeader, sortNumber } from "./table-sort";
import { UserRecordLabel, userDisplayName } from "./users";

const DASH = "—";

/**
 * A not-started assignment (no attempts) reads as a dash, and a missing one
 * (attempted but nothing submitted) as a question mark — so neither is
 * confused with a genuine zero the student earned.
 */
const STATUS_MARKS = {
  missing: "?",
  "not-started": DASH,
} as const;

type UnscoredStatus = keyof typeof STATUS_MARKS;

function isUnscored(
  status: AssignmentScore["status"],
): status is UnscoredStatus {
  return status in STATUS_MARKS;
}

/**
 * A cell with no score in it: a mark for the eye, explained once by
 * {@link ScoreLegend}, and the words a screen reader hears in its place.
 */
interface UnscoredMarkText {
  readonly label: string;
  readonly mark: string;
}

function statusMark(
  i18n: Translator,
  status: UnscoredStatus,
): UnscoredMarkText {
  return {
    label:
      status === "missing"
        ? i18n.t("Started, nothing submitted")
        : i18n.t("Not started"),
    mark: STATUS_MARKS[status],
  };
}

/**
 * An exercise with no graded work: unanswered, or awaiting a grade, which the
 * score calculation does not tell apart.
 */
function ungradedMark(i18n: Translator): UnscoredMarkText {
  return { label: i18n.t("Nothing graded"), mark: DASH };
}

const UnscoredMark: FC<UnscoredMarkText> = ({ label, mark }) => (
  <>
    <span aria-hidden="true">{mark}</span>
    <span class="visually-hidden">{label}</span>
  </>
);

/**
 * What the marks in a gradebook mean, under the table that uses them: one
 * line per mark, the first explanation given for it.
 */
const ScoreLegend: FC<{ readonly marks: readonly UnscoredMarkText[] }> = ({
  marks,
}) => {
  const lines = new Map<string, string>();

  for (const { label, mark } of marks) {
    if (!lines.has(mark)) {
      lines.set(mark, label);
    }
  }

  if (lines.size === 0) {
    return null;
  }

  // Hidden from the accessibility tree: each cell already says its own words,
  // so read aloud this would be the same phrases again, out of context.
  return (
    <p aria-hidden="true" class="small score-legend">
      {[...lines].map(([mark, label]) => (
        <span>
          <span class="score-legend-mark">{mark}</span> {label}
        </span>
      ))}
    </p>
  );
};

/** The marks a set of scores shows, in the legend's order. */
function statusMarks(
  i18n: Translator,
  scores: readonly (AssignmentScore | null)[],
): UnscoredMarkText[] {
  return (["not-started", "missing"] as const)
    .filter((status) => scores.some((score) => score?.status === status))
    .map((status) => statusMark(i18n, status));
}

/**
 * Each cell of a row with the column it sits in. The application builds a
 * row's cells by position from the same list as the columns, so a mismatch
 * is a bug there, and a table that filled the gap would hide it.
 */
function underColumns<Cell, Column>(
  cells: readonly Cell[],
  columns: readonly Column[],
): (readonly [Cell, Column])[] {
  if (cells.length !== columns.length) {
    throw new Error(
      `A gradebook row has ${cells.length} cells for ${columns.length} columns.`,
    );
  }

  return cells.map(
    (cell, index) => [cell, columns[index] as Column] as const,
  );
}

/**
 * The points alone: what they are out of is said once, under the column's
 * heading. Work that has been submitted links to it — the review queue,
 * narrowed to this student — which is where a reader who spots a low score
 * goes next.
 */
const ScoreCell: FC<{
  readonly href: string;
  readonly score: AssignmentScore | null;
}> = ({ href, score }) => {
  const i18n = useI18n();

  if (score === null) {
    return null;
  }

  if (isUnscored(score.status)) {
    return <UnscoredMark {...statusMark(i18n, score.status)} />;
  }

  return (
    <a class="score-link" href={href}>
      {score.score}
    </a>
  );
};

/**
 * One exercise's points for one student, linking to the work on that exercise
 * alone, or a dash where nothing is graded.
 */
const ExerciseScoreCell: FC<{
  readonly earned: number | null;
  readonly exercise: GradebookExercise;
  readonly href: string;
}> = ({ earned, exercise, href }) => {
  const i18n = useI18n();

  return (
    <td
      class="numeric"
      data-sort-value={sortNumber(
        earned === null ? null : fractionOf(earned, exercise.points),
      )}
    >
      {earned === null ? (
        <UnscoredMark {...ungradedMark(i18n)} />
      ) : (
        <a class="score-link" href={href}>
          {earned}
        </a>
      )}
    </td>
  );
};

/**
 * A student's course total: the points earned across every assignment that
 * has a score record. Assignments with no score for this student (a null
 * cell) contribute nothing.
 */
function totalEarned(scores: readonly (AssignmentScore | null)[]): number {
  return roundPoints(
    scores.reduce((sum, score) => sum + (score?.score ?? 0), 0),
  );
}

/** The review queue for one student's work on one assignment, any state. */
function studentWorkHref(
  courseId: string,
  assignmentId: string,
  userId: string,
  exerciseId: string | null = null,
): string {
  return `/courses/${courseId}/instructor/assignments/${assignmentId}/submissions${reviewQueryString({ exercise: exerciseId, review: "active", student: userId })}`;
}

function outOf(i18n: Translator, points: number): string {
  return i18n.t("out of {points}", { points: roundPoints(points) });
}

/**
 * What one score cell is worth as a number to sort on: the fraction of the
 * points on offer. Work that was never submitted has no score to compare — it
 * sorts as absent, after every real score, and one more click on the heading
 * brings it to the top, which is how an instructor finds it.
 */
function scoreFraction(score: AssignmentScore | null): number | null {
  return score === null || isUnscored(score.status)
    ? null
    : fractionOf(score.score, score.maxScore);
}

function fractionOf(earned: number, possible: number): number {
  return possible === 0 ? 0 : earned / possible;
}

/** The same measure over a whole row: the course total's own fraction. */
function totalFraction(
  scores: readonly (AssignmentScore | null)[],
): number | null {
  let earned = 0;
  let possible = 0;

  for (const score of scores) {
    if (score === null) {
      continue;
    }

    earned += score.score;
    possible += score.maxScore;
  }

  return possible === 0 ? null : earned / possible;
}

/**
 * Who a row is about: the name, with the email quietly under it, or the email
 * alone for a student who has not given a name — so no row starts blank. It
 * sorts by the line a reader looks for it under.
 */
const StudentCell: FC<{ readonly user: User }> = ({ user }) => {
  const i18n = useI18n();

  return (
    <td data-sort-value={userDisplayName(i18n, user, user.id)}>
      <UserRecordLabel user={user} userId={user.id} />
    </td>
  );
};

const CourseGradebookTable: FC<{
  readonly courseId: string;
  readonly gradebook: CourseGradebook;
}> = ({ courseId, gradebook }) => {
  const i18n = useI18n();
  const coursePoints = gradebook.maxScores.reduce(
    (sum, points) => sum + points,
    0,
  );

  return (
    <>
      <TableScroll stickyLead>
        <thead>
          <tr>
            <SortHeader label={i18n.t("Student")} />
            <SortHeader
              detail={outOf(i18n, coursePoints)}
              label={i18n.t("Total")}
              numeric
            />
            {/* Every assignment is a column a reader can order by — "who has
                not done problem set 3" is the question this table exists to
                answer. */}
            {underColumns(gradebook.maxScores, gradebook.assignments).map(
              ([points, assignment]) => (
                <SortHeader
                  detail={outOf(i18n, points)}
                  label={assignment.title}
                  numeric
                />
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {gradebook.rows.map((row) => (
            <tr>
              <StudentCell user={row.user} />
              <td
                class="numeric"
                data-sort-value={sortNumber(totalFraction(row.scores))}
              >
                <strong>{totalEarned(row.scores)}</strong>
              </td>
              {underColumns(row.scores, gradebook.assignments).map(
                ([score, assignment]) => (
                  <td
                    class="numeric"
                    data-sort-value={sortNumber(scoreFraction(score))}
                  >
                    <ScoreCell
                      href={studentWorkHref(
                        courseId,
                        assignment.id,
                        row.user.id,
                      )}
                      score={score}
                    />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </TableScroll>
      <ScoreLegend
        marks={statusMarks(
          i18n,
          gradebook.rows.flatMap((row) => row.scores),
        )}
      />
    </>
  );
};

/**
 * The assignment's score, then one column per exercise: the per-exercise
 * points the export already carries, so "which question tripped everyone up"
 * is a sort away. An exercise with no evaluated work for the student is a
 * dash, "nothing graded", which is all the score calculation can say about it.
 */
const AssignmentGradebookTable: FC<{
  readonly courseId: string;
  readonly gradebook: AssignmentGradebook;
}> = ({ courseId, gradebook }) => {
  const i18n = useI18n();
  const assignmentId = gradebook.assignment.id;
  const points = gradebook.exercises.reduce(
    (sum, exercise) => sum + exercise.points,
    0,
  );

  return (
    <>
      <TableScroll stickyLead>
        <thead>
          <tr>
            <SortHeader label={i18n.t("Student")} />
            <SortHeader
              detail={outOf(i18n, points)}
              label={i18n.t("Score")}
              numeric
            />
            {gradebook.exercises.map((exercise) => (
              <SortHeader
                detail={outOf(i18n, exercise.points)}
                label={exercise.title ?? exercise.id}
                numeric
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {gradebook.rows.map((row) => (
            <tr>
              <StudentCell user={row.user} />
              <td
                class="numeric"
                data-sort-value={sortNumber(scoreFraction(row.score))}
              >
                <strong>
                  <ScoreCell
                    href={studentWorkHref(
                      courseId,
                      assignmentId,
                      row.user.id,
                    )}
                    score={row.score}
                  />
                </strong>
              </td>
              {underColumns(row.exerciseScores, gradebook.exercises).map(
                ([earned, exercise]) => (
                  <ExerciseScoreCell
                    earned={earned}
                    exercise={exercise}
                    href={studentWorkHref(
                      courseId,
                      assignmentId,
                      row.user.id,
                      exercise.id,
                    )}
                  />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </TableScroll>
      {/* The ungraded dash first, since it is the broader reading of the
          two dashes: a student who has not started has nothing graded. */}
      <ScoreLegend
        marks={[
          ...(gradebook.rows.some((row) => row.exerciseScores.includes(null))
            ? [ungradedMark(i18n)]
            : []),
          ...statusMarks(
            i18n,
            gradebook.rows.map((row) => row.score),
          ),
        ]}
      />
    </>
  );
};

export function renderCourseGradebook(
  context: Context<AppBindings>,
  courseId: string,
  courseTitle: string,
  gradebook: CourseGradebook,
): Response {
  const i18n = context.get("i18n");

  return renderShell(
    context,
    {
      breadcrumb: [coursesCrumb(i18n), courseCrumb(courseId, courseTitle)],
      // Scored twice over: this page and the one for a single assignment are
      // both a table of names and numbers under a trail whose middle crumbs
      // can read alike, so each says which of the two it is rather than
      // leaving "Gradebook" and "Grades" to carry the distinction alone.
      title: i18n.t("Course gradebook"),
    },
    <Sheet
      description={i18n.t(
        "Scores on every published graded assignment. Practice scores are on each practice assignment's own page.",
      )}
      title={i18n.t("Course gradebook")}
    >
      <CourseGradebookTable courseId={courseId} gradebook={gradebook} />
    </Sheet>,
  );
}

export function renderAssignmentGradebook(
  context: Context<AppBindings>,
  courseId: string,
  courseTitle: string,
  gradebook: AssignmentGradebook,
  staffTier: CourseStaffTier,
): Response {
  const i18n = context.get("i18n");
  const graded = gradebook.assignment.assessmentMode === "graded";
  // Same table for both modes, so the words around it carry the difference. A
  // practice set's points are scores and not grades — they reach no course
  // total and no LMS — and a page headed "grades" over a sheet that says the
  // opposite is how an instructor comes away unsure which they are looking at.
  const title = graded
    ? i18n.t("Assignment grades")
    : i18n.t("Practice scores");

  return renderShell(
    context,
    {
      breadcrumb: [
        coursesCrumb(i18n),
        courseCrumb(courseId, courseTitle),
        staffAssignmentCrumb(
          staffTier,
          courseId,
          gradebook.assignment.id,
          gradebook.assignment.title,
        ),
      ],
      title,
    },
    <Sheet
      description={
        graded
          ? i18n.t("Scores, status, and export controls for this assignment.")
          : i18n.t(
              "Practice scores are recorded, and do not count toward the course total.",
            )
      }
      title={title}
    >
      <AssignmentGradebookTable courseId={courseId} gradebook={gradebook} />
      <LinkStrip
        links={[
          {
            hint: graded
              ? i18n.t("CSV of the current grades")
              : i18n.t("CSV of the current scores"),
            href: `/courses/${courseId}/instructor/assignments/${gradebook.assignment.id}/grades.csv`,
            label: i18n.t("Export CSV"),
          },
          {
            hint: i18n.t("Newest submissions and manual grading"),
            href: `/courses/${courseId}/instructor/assignments/${gradebook.assignment.id}/submissions`,
            // Not "Review submissions", which broke onto two lines on a
            // phone; the hint says what is done there.
            label: i18n.t("Submissions"),
          },
        ]}
      />
    </Sheet>,
  );
}

/**
 * The instructor's free-text comment on a submission, stored on a manual
 * evaluation's `result.feedback`. Automatic evaluations carry no comment.
 */
function instructorComment(
  evaluation: ViewerEvaluation | null,
): string | null {
  if (evaluation === null || evaluation.evaluatorKind !== "manual") {
    return null;
  }

  const result = evaluation.result;

  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result)
  ) {
    return null;
  }

  const feedback = (result as Record<string, unknown>).feedback;

  return typeof feedback === "string" && feedback.length > 0
    ? feedback
    : null;
}

const ResultExercise: FC<{ readonly entry: SubmissionHistoryEntry }> = ({
  entry,
}) => {
  const i18n = useI18n();
  const comment = instructorComment(entry.evaluation);
  // Null whenever the numbers are sealed: a drift note names the stored
  // denominator's disagreement, which cannot be said about a number the
  // student may not see.
  const drift = storedPointsDrift(entry.evaluation, entry.nominalPoints);

  return (
    <div class="result-exercise">
      <div class="result-exercise-header">
        {/* By its title, the name the student met it under in the lesson —
            the same fallback as the corrections ledger's (#189): the id where
            there is no title, and a bare "Exercise" where there is no id. */}
        <strong>
          {entry.exerciseTitle ??
            entry.submission.exerciseId ??
            i18n.t("Exercise")}
        </strong>
        {/* Three states, not two. No evaluation means nothing has graded this
            yet — a free response waiting on an instructor, or an exercise
            withholding its verdict, which are deliberately the same silence.
            An evaluation with no number means it *is* graded and the score is
            behind the release date, which "Not yet graded" would misreport. */}
        {entry.evaluation === null ? (
          <span class="small">{i18n.t("Not yet graded")}</span>
        ) : entry.evaluation.score === null ? (
          <span class="small">{i18n.t("Score not released yet")}</span>
        ) : (
          <span class={drift === null ? undefined : "points-drift"}>
            {entry.evaluation.score}/{entry.evaluation.maxScore}
            {drift === null ? null : <PointsDriftNote drift={drift} />}
          </span>
        )}
      </div>
      {/* The question as the lesson asked it, so the answer below reads
          with its context. Compiled and sanitized at save time, as it is in
          the lesson. */}
      {entry.exercisePromptHtml === null ? null : (
        <div class="result-exercise-prompt">
          {raw(entry.exercisePromptHtml)}
        </div>
      )}
      {entry.answerReview === null ? null : (
        <AnswerReview review={entry.answerReview} />
      )}
      {comment === null ? null : (
        <div class="instructor-comment">
          <h4>{i18n.t("Instructor comment")}</h4>
          <p>{comment}</p>
        </div>
      )}
    </div>
  );
};

/** "Attempt N was reset on <date>", the date element where the translator put it. */
const ResetAttemptNote: FC<{
  readonly at: string;
  readonly ordinal: number;
}> = ({ at, ordinal }) => {
  const i18n = useI18n();
  const [before, after] = splitAtValue(
    i18n.t(
      "Attempt {ordinal} was reset on {when}. Its work no longer counts toward your grade.",
      { ordinal, when: VALUE },
    ),
  );

  return (
    <>
      {before}
      <Time value={at} />
      {after}
    </>
  );
};

/**
 * The head of the results page: the score the course page shows for this
 * assignment, how many attempts there were, and when the last answer went in,
 * with the way back to the assignment. Without it the page opened straight
 * into its first question, and the total was only on the course page.
 *
 * No attempt is named as the one that counts: an assignment's score takes
 * each exercise's best across its attempts, so every attempt can count.
 */
const ResultsSummary: FC<{
  readonly assignmentHref: string;
  readonly assignmentTitle: string;
  readonly results: StudentAssignmentResults;
  readonly score: StudentScorecardEntry | null;
}> = ({ assignmentHref, assignmentTitle, results, score }) => {
  const i18n = useI18n();
  const submittedAt = results.attempts
    .flatMap((attempt) =>
      attempt.entries.map((entry) => entry.submission.submittedAt),
    )
    .reduce<string | null>(
      (latest, at) => (latest === null || at > latest ? at : latest),
      null,
    );
  const items: SummaryItem[] = [];

  if (score !== null) {
    items.push({
      label: i18n.t("Score"),
      value:
        score.earned === null
          ? i18n.t("—/{worth}", { worth: score.worth })
          : `${score.earned}/${score.worth}`,
    });
  }

  items.push({
    label: i18n.t("Attempts"),
    value: String(results.attempts.length),
  });

  if (submittedAt !== null) {
    items.push({
      label: i18n.t("Last answer"),
      value: <Time value={submittedAt} />,
    });
  }

  return (
    <Sheet summary={<SummaryStrip items={items} />} title={assignmentTitle}>
      <LinkStrip
        links={[
          {
            hint: i18n.t("Back to its questions"),
            href: assignmentHref,
            label: i18n.t("Assignment"),
          },
        ]}
      />
    </Sheet>
  );
};

export function renderStudentAssignmentResults(
  context: Context<AppBindings>,
  model: {
    readonly assignmentId: string;
    readonly assignmentTitle: string;
    readonly courseId: string;
    readonly courseTitle: string;
    readonly results: StudentAssignmentResults;
    /** The course page's figure for this assignment; null where it has none. */
    readonly score: StudentScorecardEntry | null;
  },
): Response {
  const i18n = context.get("i18n");
  const breadcrumb = [
    coursesCrumb(i18n),
    courseCrumb(model.courseId, model.courseTitle),
    studentAssignmentCrumb(
      model.courseId,
      model.assignmentId,
      model.assignmentTitle,
    ),
  ];

  // One line per reset attempt, ahead of the attempts that still count: its
  // work is no longer shown, and without a word it would simply have gone.
  const resetNotes =
    model.results.resetAttempts.length === 0 ? null : (
      <Notice>
        {model.results.resetAttempts.map((reset, index) => (
          <>
            {index === 0 ? null : " "}
            <ResetAttemptNote at={reset.resetAt} ordinal={reset.ordinal} />
          </>
        ))}
      </Notice>
    );

  // With only reset attempts behind them, the notes are the whole answer:
  // "you have not submitted any work" would deny the work they remember.
  if (model.results.attempts.length === 0) {
    return renderShell(
      context,
      { breadcrumb, title: i18n.t("Results") },
      resetNotes ?? (
        <Sheet title={i18n.t("Results")}>
          <p>
            {i18n.t("You have not submitted any work for this assignment.")}
          </p>
        </Sheet>
      ),
    );
  }

  const anyDrift = model.results.attempts.some((attempt) =>
    attempt.entries.some(
      (entry) =>
        storedPointsDrift(entry.evaluation, entry.nominalPoints) !== null,
    ),
  );

  return renderShell(
    context,
    { breadcrumb, title: i18n.t("Results") },
    // The work is theirs to read back whether or not the grades are out; what
    // is missing while they are not is every number, withheld per exercise
    // upstream. Saying so once at the top beats a page of "Not yet graded"
    // with nothing to explain it.
    <>
      <ResultsSummary
        assignmentHref={`/courses/${model.courseId}/assignments/${model.assignmentId}`}
        assignmentTitle={model.assignmentTitle}
        results={model.results}
        score={model.score}
      />
      {resetNotes}
      {anyDrift ? (
        <Notice tone="warn">
          {i18n.t(
            "Some scores here were graded when their exercises were worth different points. Each shows the points it was graded out of; the assignment total counts every exercise at its current points.",
          )}
        </Notice>
      ) : null}
      {/* A banner, not a sheet: a line of explanation above the attempts.
          Each sentence is whole on its own, and either can stand alone. */}
      {model.results.released && !model.results.workToCome ? null : (
        <Notice>
          {[
            model.results.released
              ? null
              : i18n.t(
                  "Grades for this assignment have not been released yet.",
                ),
            // Only for work that is coming: under "never" the page just shows
            // the scores, with no notice to read as a fault or a promise.
            model.results.workToCome
              ? i18n.t(
                  "Your answers and any instructor comments for this assignment will be shown here once your instructor releases them.",
                )
              : null,
          ]
            .filter((sentence) => sentence !== null)
            .join(" ")}
        </Notice>
      )}
      {model.results.attempts.map((attempt) => (
        <Sheet
          description={
            model.results.workReleased
              ? i18n.t(
                  "Your answers, the expected results, and instructor comments.",
                )
              : undefined
          }
          title={i18n.t("Attempt {ordinal}", { ordinal: attempt.ordinal })}
        >
          {attempt.entries.length === 0 ? (
            <p class="small">
              {i18n.t("No submissions were recorded in this attempt.")}
            </p>
          ) : (
            attempt.entries.map((entry) => <ResultExercise entry={entry} />)
          )}
        </Sheet>
      ))}
    </>,
  );
}
