/**
 * A distinguish exercise's vocabulary restriction: which symbols the
 * student's sentence may use (`symbols=`) or may not (`without=`).
 *
 * The author spells a symbol the way the language does — `=`, `∀`,
 * `LeftOf` — and the compiler resolves each spelling to constructors once
 * ({@link resolveSpelling}), so the check compares constructors, not
 * spellings, and a language with several spellings of one connective has
 * them all caught by naming any one. It reads the parse tree rather than the
 * formula the evaluator gets, because the formula has already unfolded `a≠b`
 * into `¬a=b` and would blame the student for a negation they never wrote.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import { spellingMeanings, walkTerm } from "@aufbau/syntax";
import { argumentListSort, sentenceSort } from "../../../logic/specs/roles";
import type { WorldRestriction } from "../types";

/** A name's key in a used-symbol set, kept apart from constructor names. */
function nameKey(name: string): string {
  return `name ${name}`;
}

/**
 * Everything an author's spelling names: a constructor by its own name or by
 * any token it is written with, or an object name. Usually one symbol, but
 * a spelling can be several at once — Calgary's `E` is the predicate letter
 * E and, through an elab rule, an ASCII ∃, told apart only by where it is
 * written — and a list
 * that names `E` means all of them, as the student's `E` could be any.
 * Empty when the language has no such symbol, which the compiler reports.
 */
export function resolveSpelling(
  spelling: string,
  lang: SurfaceLanguage,
): readonly string[] {
  const { terms, varSorts } = spellingMeanings(lang, spelling);

  // A variable no quantifier binds is an object's name.
  return varSorts.some((sort) => !lang.bindableSorts.has(sort))
    ? [...terms, nameKey(spelling)]
    : terms;
}

/**
 * The spellings in `restriction` a sentence breaks, as the author wrote them;
 * `null` when the sentence does not parse (the caller reports that).
 */
export function restrictionBreaches(
  source: string,
  lang: SurfaceLanguage,
  restriction: WorldRestriction,
): readonly string[] | null {
  const sort = sentenceSort(lang);
  const parsed = lang.parse(source, sort === undefined ? {} : { sort });

  if (!parsed.ok) {
    return null;
  }

  const list = argumentListSort(lang);
  const used = new Map<string, string>();

  walkTerm(parsed.term, (node) => {
    if (node.kind === "variable") {
      if (!lang.bindableSorts.has(node.sort) && !node.binder) {
        used.set(nameKey(node.name), node.name);
      }

      return;
    }

    if (!lang.coercionNames.has(node.term) && node.sort !== list) {
      used.set(node.term, node.token ?? node.term);
    }
  });

  if (restriction.without !== undefined) {
    return restriction.without.flatMap(({ keys, spelling }) =>
      keys.some((key) => used.has(key)) ? [spelling] : [],
    );
  }

  if (restriction.symbols !== undefined) {
    const allowed = new Set(restriction.symbols.flatMap(({ keys }) => keys));

    // Names are not vocabulary: a list of what may be used says which
    // predicates, connectives and quantifiers, and a sentence may still talk
    // about any object that has a name. `without=` can forbid one outright.
    return [...used].flatMap(([key, shown]) =>
      allowed.has(key) || key.startsWith("name ") ? [] : [shown],
    );
  }

  return [];
}
