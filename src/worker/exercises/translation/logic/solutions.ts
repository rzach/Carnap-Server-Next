/**
 * Whether a submitted formula *is* one of the intended answers, typed out.
 *
 * This is the fast path both the widget and the grader take before any
 * equivalence search, and the two have to agree exactly — a student told "this
 * matches" by the widget and marked wrong by the server would have no way to
 * make sense of it — so they share this rather than each comparing strings.
 *
 * The solutions are stored as engine text, and both sides are compared as
 * formulas, written out by the display printer: `a≠b` typed for a stored
 * `¬a=b` is the same formula spelled another way, and matches. A solution
 * that does not read back is skipped, which is the same "cannot be correct"
 * it would be if it were compared and missed.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import type { Formula } from "../../../exercise-kit/formula";
import {
  formulaToString,
  parseEngineFormula,
} from "../../../exercise-kit/formula";

/**
 * The index of the first stored solution the formula matches verbatim, or
 * `-1`. The index matters: it is what a certificate names.
 */
export function verbatimSolutionIndex(
  formula: Formula,
  solutions: readonly string[],
  lang: SurfaceLanguage,
): number {
  const canonical = formulaToString(formula, lang);

  return solutions.findIndex((solution) => {
    const parsed = parseEngineFormula(solution, lang);

    return parsed.ok && formulaToString(parsed.formula, lang) === canonical;
  });
}
