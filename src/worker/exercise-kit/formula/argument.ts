/**
 * An argument as an author writes it on one line: `premises :|-: conclusions`,
 * each side a comma-separated list of formulas.
 *
 * Every type that asks about an argument reads this one spelling (the truth
 * table's validity variant, the model's and the world's counterexamples), so
 * an author meets one notation for "this argument" wherever they write one.
 * A truth tree takes none: its author lists the root's rows. The turnstile is ASCII because `∴` and
 * `⊢` are hard to type. If a second spelling is ever accepted, it belongs
 * here, for every type at once.
 *
 * What a missing side or a stray turnstile means is each type's to say: a
 * truth table needs premises, a world's counterexample does not.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import { splitTopLevel } from "@aufbau/syntax";

/** What separates an argument's premises from its conclusions. */
export const ARGUMENT_TURNSTILE = ":|-:";

/** Whether a body line is an argument line. */
export function isArgumentLine(line: string): boolean {
  return line.includes(ARGUMENT_TURNSTILE);
}

/** An argument line's two sides, each piece trimmed and none empty. */
export interface ArgumentLine {
  readonly premises: readonly string[];
  readonly conclusions: readonly string[];
}

function pieces(side: string, lang: SurfaceLanguage): string[] {
  return splitTopLevel(lang, side, ",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

/**
 * Split an argument line into its premises and conclusions, or `null` when it
 * has more than one turnstile. A leading list bullet is dropped, so
 * `- P :|-: Q` reads as well. Each side splits at its commas outside the
 * language's brackets, since `R(a, b)` has a comma of its own.
 */
export function splitArgumentLine(
  line: string,
  lang: SurfaceLanguage,
): ArgumentLine | null {
  const parts = line.replace(/^\s*-\s+/, "").split(ARGUMENT_TURNSTILE);

  if (parts.length !== 2) {
    return null;
  }

  return {
    conclusions: pieces(parts[1] ?? "", lang),
    premises: pieces(parts[0] ?? "", lang),
  };
}
