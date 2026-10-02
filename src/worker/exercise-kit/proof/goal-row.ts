import { escapeHtml } from "../../application/content/render-support";
import type { Translator } from "../../i18n/translator";
import { goalStatementText } from "./formulas";
import {
  isPlaygroundExercise,
  type PlaygroundGoal,
  playgroundGoalText,
} from "./playground";

/**
 * The goal row every proof widget shows above its editor — "Prove" and the
 * fixed statement, or, in a playground, "Proves" and the statement the proof
 * makes — and the same row on the review and results pages, where a
 * submitted proof would otherwise be shown with nothing to say what it was
 * meant to prove. The widgets draw it in the browser; a review is drawn here,
 * since a review never runs the editor. Its look is `./goal.css`.
 */
export interface ProofGoalRow {
  readonly label: string;
  readonly statement: string;
}

/** The theorem declaration line, its keyword and trailing `;` taken off. */
export function goalDeclaration(mm0: string): string {
  const lines = mm0.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = (lines[index] ?? "").trim();
    if (/^theorem\b/.test(line)) {
      return line.replace(/;\s*$/, "").replace(/^theorem\s+/, "");
    }
  }
  return "";
}

/**
 * What to show as a fixed goal, given the exercise's two theory texts.
 *
 * The statement the goal declares, with the theorem's name, its binders and
 * its `$ … $` taken off — the same thing the tree and Prawitz editors show,
 * and the same register as the surface text the student types below it. A
 * declaration is how a goal is *stored*, not how it is asked: `unimp {x: var}
 * {a: name}` names an engine handle that is not even the exercise id, and
 * binds a variable whose only job is to make `∀ x` legal.
 *
 * Whether the theory is a *language* does not come into it — that decides how
 * the formulas are read, not how the declaration around them splits. The
 * fallback is the declaration as written, reached only when the text declares
 * no such goal at all, where showing the line beats showing nothing.
 */
export function goalText(
  theory: { readonly mm0: string; readonly source: string | null },
  goalName: string,
): string {
  return (
    goalStatementText(theory.source, goalName) ?? goalDeclaration(theory.mm0)
  );
}

/**
 * The row a review shows for one submitted proof: the exercise's own goal,
 * or, in a playground, the goal the answer derived — what the recorded
 * verdict is about. `null` where there is nothing to say: a playground answer
 * saved without its goal, or a fixed goal the stored text no longer declares.
 */
export function reviewGoalRow(
  i18n: Translator,
  publicData: unknown,
  answerGoal: PlaygroundGoal | undefined,
  theory: { readonly source: string | null },
  fixedStatement: string,
): ProofGoalRow | null {
  if (isPlaygroundExercise(publicData)) {
    return answerGoal === undefined
      ? null
      : {
          label: i18n.t("Proves"),
          statement: playgroundGoalText(theory.source, answerGoal),
        };
  }

  return fixedStatement.length === 0
    ? null
    : { label: i18n.t("Prove"), statement: fixedStatement };
}

/** The row as server markup, the shape the widgets build in the browser. */
export function proofGoalRowHtml(row: ProofGoalRow | null): string {
  // The space is for text readers; the row's gap draws the visible one.
  return row === null
    ? ""
    : `<div class="proof-goal"><span class="proof-goal-label">${escapeHtml(row.label)}</span> <span class="proof-goal-statement">${escapeHtml(row.statement)}</span></div>`;
}
