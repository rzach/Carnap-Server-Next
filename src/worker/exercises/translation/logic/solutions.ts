/**
 * Whether a submitted formula *is* one of the intended answers, typed out.
 *
 * This is the fast path both the widget and the grader take before any
 * equivalence search, and the two have to agree exactly — a student told "this
 * matches" by the widget and marked wrong by the server would have no way to
 * make sense of it — so they share this rather than each comparing strings.
 *
 * Both sides are engine text, compared with every def unfolded
 * ({@link unfoldedEngineText}): `a≠b` typed for a stored `¬a=b` is the same
 * formula to the engine, and matches, and how either is displayed does not
 * come into it. A solution that does not read back is skipped, which is the
 * same "cannot be correct" it would be if it were compared and missed.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import { unfoldedEngineText } from "../../../exercise-kit/formula";

/**
 * The index of the first stored solution the formula, as engine text, matches
 * verbatim, or `-1`. The index matters: it is what a certificate names.
 */
export function verbatimSolutionIndex(
  engine: string,
  solutions: readonly string[],
  lang: SurfaceLanguage,
): number {
  const typed = unfoldedEngineText(engine, lang);

  if (typed === null) {
    return -1;
  }

  return solutions.findIndex(
    (solution) => unfoldedEngineText(solution, lang) === typed,
  );
}
