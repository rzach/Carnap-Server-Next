import type { Context } from "hono";
import type { FC } from "hono/jsx";

import type { Assignment } from "../domain/assignments";
import type { Timestamp } from "../domain/time";
import type { AppBindings } from "../http";
import {
  BarField,
  CreateBar,
  StatusBadge,
  shortCreateLabel,
  TableScroll,
  Time,
} from "./components";
import {
  ASSESSMENT_MODE_ORDER,
  ASSIGNMENT_STATE_ORDER,
  assessmentModeLabel,
  assignmentStateLabel,
} from "./labels";
import { useI18n } from "./layout";
import { SortHeader, sortRank } from "./table-sort";

/**
 * The instructor's Type cell: the mode, which every row has, as plain text,
 * and a badge only for what makes a row an exception — a draft students cannot
 * see yet, or a published assignment left off their list.
 */
const AssignmentType: FC<{ readonly assignment: Assignment }> = ({
  assignment,
}) => {
  const i18n = useI18n();

  return (
    <>
      {assessmentModeLabel(i18n, assignment.assessmentMode)}
      {assignment.state === "draft" ? (
        <>
          {" "}
          <StatusBadge
            label={assignmentStateLabel(i18n, assignment.state)}
            tone="warn"
          />
        </>
      ) : null}
      {assignment.listed ? null : (
        <>
          {" "}
          <StatusBadge label={i18n.t("Hidden")} tone="warn" />
        </>
      )}
    </>
  );
};

/**
 * A due date, or a faint dash where there is none, so that the rows with a
 * date stand out from the ones without instead of every cell reading "None".
 */
const DueDate: FC<{ readonly value: Timestamp | null }> = ({ value }) =>
  value === null ? (
    <span class="table-empty">—</span>
  ) : (
    <Time value={value} />
  );

const AssignmentRow: FC<{
  readonly assignment: Assignment;
  readonly courseId: string;
}> = ({ assignment, courseId }) => {
  const i18n = useI18n();

  return (
    <tr>
      <td>
        <a
          href={`/courses/${courseId}/instructor/assignments/${assignment.id}`}
        >
          {assignment.title}
        </a>
      </td>
      {/* The mode first, since that is what the column is named for; within
          a mode, the ordinary rows before the flagged ones. */}
      <td data-sort-value={typeSortValue(assignment)}>
        <AssignmentType assignment={assignment} />
      </td>
      {/* The instant, not the date the reader sees: the cell is localized on
          load, and "Jul 6" does not sort. */}
      <td data-sort-value={assignment.dueAt ?? ""}>
        <DueDate value={assignment.dueAt} />
      </td>
      <td>
        {/* A practice set has a table of its own too, and the word changes
            with the mode: what it holds are scores, which reach no course
            total. A reading has neither, and gets no link. */}
        {assignment.assessmentMode === "none" ? null : (
          <a
            href={`/courses/${courseId}/instructor/assignments/${assignment.id}/gradebook`}
          >
            {assignment.assessmentMode === "graded"
              ? i18n.t("Grades")
              : i18n.t("Scores")}
          </a>
        )}
      </td>
    </tr>
  );
};

/**
 * The instructor's Type cell as one number: the mode, then published before
 * draft, then listed before hidden — the same order the cell reads in.
 */
function typeSortValue(assignment: Assignment): string {
  const mode = ASSESSMENT_MODE_ORDER.indexOf(assignment.assessmentMode);
  const state = ASSIGNMENT_STATE_ORDER.indexOf(assignment.state);

  return String(mode * 100 + state * 10 + (assignment.listed ? 0 : 1));
}

/**
 * The staff's list of a course's assignments, drafts and hidden ones
 * included, each linked to its record. Students get their own list (see
 * `StudentAssignmentsTable`), grouped by date and carrying their progress.
 */
export const AssignmentsTable: FC<{
  readonly assignments: readonly Assignment[];
  readonly courseId: string;
}> = ({ assignments, courseId }) => {
  const i18n = useI18n();

  if (assignments.length === 0) {
    return <p>{i18n.t("No assignments have been created yet.")}</p>;
  }

  return (
    <TableScroll phoneList>
      <thead>
        <tr>
          <SortHeader label={i18n.t("Title")} />
          <SortHeader label={i18n.t("Type")} />
          <SortHeader label={i18n.t("Due")} />
          {/* The column holds a link per row, and what it leads to is a table
              of grades for one assignment and of practice scores for another,
              so the heading takes the word that covers both. There is nothing
              in it to sort. */}
          <th scope="col">{i18n.t("Scores")}</th>
        </tr>
      </thead>
      <tbody>
        {assignments.map((assignment) => (
          <AssignmentRow assignment={assignment} courseId={courseId} />
        ))}
      </tbody>
    </TableScroll>
  );
};

/**
 * A teaching assistant's assignments: what there is to grade. One row per
 * published assignment, and the two places a grader goes — the review queue
 * and the assignment's grade table — as links in their own columns rather
 * than behind the title, because the title's usual destination, the
 * assignment's settings page, is an instructor's and would answer a
 * forbidden. A reading collects nothing and so has neither link; the row
 * still appears, since the list is the course's assignments and not only
 * the ones with work in them.
 */
export const GradingTable: FC<{
  readonly assignments: readonly Assignment[];
  readonly courseId: string;
}> = ({ assignments, courseId }) => {
  const i18n = useI18n();

  if (assignments.length === 0) {
    return <p>{i18n.t("No assignments have been published yet.")}</p>;
  }

  return (
    <TableScroll phoneList>
      <thead>
        <tr>
          <SortHeader label={i18n.t("Title")} />
          <SortHeader label={i18n.t("Type")} />
          <SortHeader label={i18n.t("Due")} />
          <th scope="col">{i18n.t("Submissions")}</th>
          <th scope="col">{i18n.t("Scores")}</th>
        </tr>
      </thead>
      <tbody>
        {assignments.map((assignment) => {
          const base = `/courses/${courseId}/instructor/assignments/${assignment.id}`;
          const collects = assignment.assessmentMode !== "none";

          return (
            <tr>
              <td>{assignment.title}</td>
              <td
                data-sort-value={sortRank(
                  ASSESSMENT_MODE_ORDER,
                  assignment.assessmentMode,
                )}
              >
                {assessmentModeLabel(i18n, assignment.assessmentMode)}
              </td>
              <td data-sort-value={assignment.dueAt ?? ""}>
                <DueDate value={assignment.dueAt} />
              </td>
              <td>
                {collects ? (
                  <a href={`${base}/submissions`}>
                    {i18n.t("Review submissions")}
                  </a>
                ) : null}
              </td>
              <td>
                {collects ? (
                  <a href={`${base}/gradebook`}>
                    {assignment.assessmentMode === "graded"
                      ? i18n.t("Grades")
                      : i18n.t("Scores")}
                  </a>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableScroll>
  );
};

export const AssignmentCreateBar: FC<{
  readonly context: Context<AppBindings>;
  readonly courseId: string;
}> = ({ context, courseId }) => {
  const i18n = useI18n();

  return (
    <CreateBar
      action={`/courses/${courseId}/assignments`}
      context={context}
      shortLabel={shortCreateLabel(i18n)}
      submitLabel={i18n.t("Create assignment")}
    >
      <input name="quickCreate" type="hidden" value="1" />
      <BarField label={i18n.t("New assignment title")}>
        <input maxlength={200} name="title" required />
      </BarField>
    </CreateBar>
  );
};
