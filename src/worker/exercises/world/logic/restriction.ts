/**
 * A distinguish exercise's vocabulary restriction: which symbols the
 * student's sentence may use (`symbols=`) or may not (`without=`).
 *
 * The author spells a symbol the way the language does — `=`, `∀`,
 * `LeftOf` — and the check compares constructors, not spellings, so a
 * language with several spellings of one connective has them all caught by
 * naming any one. It reads the parse tree rather than the formula the
 * evaluator gets, because the formula has already unfolded `a≠b` into `¬a=b`
 * and would blame the student for a negation they never wrote.
 */

import type { NotationInfo, SurfaceLanguage } from "@aufbau/syntax";
import { walkTerm } from "@aufbau/syntax";
import { argumentListSort, sentenceSort } from "../../../logic/specs/roles";

/** A name's key in a used-symbol set, kept apart from constructor names. */
function nameKey(name: string): string {
  return `name ${name}`;
}

function leadingToken(notation: NotationInfo): string | null {
  if (notation.form === "simple") {
    return notation.token;
  }

  for (const literal of notation.literals) {
    if (literal.kind === "constant") {
      return literal.token;
    }
  }

  return null;
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
  const keys = new Set<string>();

  if (lang.spec.terms.has(spelling)) {
    keys.add(spelling);
  }

  const tokens = new Set([spelling]);

  // An elab rule is a spelling too: Calgary's `E ?x` is written for `∃ ?x`,
  // so naming `E` names what its template's literals spell.
  for (const rule of lang.spec.elabRules) {
    if (
      rule.pattern.some(
        (element) => element.kind === "literal" && element.token === spelling,
      )
    ) {
      for (const element of rule.template) {
        if (element.kind === "literal") {
          tokens.add(element.token);
        }
      }
    }
  }

  for (const notation of lang.spec.notations) {
    const token = leadingToken(notation);

    if (token !== null && tokens.has(token)) {
      keys.add(notation.term);
    }
  }

  for (const info of lang.spec.sorts.values()) {
    if (!lang.bindableSorts.has(info.name) && info.vars.includes(spelling)) {
      keys.add(nameKey(spelling));
    }
  }

  return [...keys];
}

/**
 * The spellings in `restriction` a sentence breaks, as the author wrote them;
 * `null` when the sentence does not parse (the caller reports that).
 */
export function restrictionBreaches(
  source: string,
  lang: SurfaceLanguage,
  restriction: {
    readonly symbols?: readonly string[];
    readonly without?: readonly string[];
  },
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
    return restriction.without.filter((spelling) =>
      resolveSpelling(spelling, lang).some((key) => used.has(key)),
    );
  }

  if (restriction.symbols !== undefined) {
    const allowed = new Set(
      restriction.symbols.flatMap((spelling) =>
        resolveSpelling(spelling, lang),
      ),
    );

    // Names are not vocabulary: a list of what may be used says which
    // predicates, connectives and quantifiers, and a sentence may still talk
    // about any object that has a name. `without=` can forbid one outright.
    return [...used].flatMap(([key, shown]) =>
      allowed.has(key) || key.startsWith("name ") ? [] : [shown],
    );
  }

  return [];
}
