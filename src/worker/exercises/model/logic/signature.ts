/**
 * What a set of formulas asks a model to interpret.
 *
 * The exercise's fields are not authored — they are read off the formulas, so
 * that `AxR(x,f(x))` asks for a domain, an extension for `R(_,_)` and a value
 * table for `f(_)`, and nothing else. This is the original's
 * `blankTerms`/`blankFuncTerms` plus the sort inside `appendInputs`, with the
 * DOM taken out (`CounterModel.hs:260-302`).
 *
 * A symbol's identity includes its **arity**, matching Carnap, which keys
 * relations by `(index, arity)`: `F(a)` and `F(a,b)` are two different
 * predicates and get two separate fields.
 *
 * A variable that occurs **free** asks for a value too — the assignment the
 * formula is evaluated at — and gets a field of its own, filled in or given
 * exactly as a constant is. Only a language without `closed-sentences` lets
 * one through the parser, so for every closed exercise nothing changes.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import type { Formula, Term } from "../../../exercise-kit/formula";
import {
  languageNames,
  parseFormula,
  parseTerm,
  symbolKey,
  termToString,
} from "../../../exercise-kit/formula";

export type ModelFieldKind =
  | "domain"
  | "relation"
  | "proposition"
  | "constant"
  | "variable"
  | "function";

export interface ModelField {
  /** 0 for the domain, a proposition, a constant, or a variable. */
  readonly arity: number;
  /**
   * The field's key in a submitted answer and in an exercise's givens, made
   * from what the field *is* rather than how it is written: `relation F/2`,
   * `function f/1`, `constant a/0`, `domain` (see {@link fieldKey}). So a change
   * to how the language prints or reads a symbol cannot orphan stored work.
   */
  readonly key: string;
  readonly kind: ModelFieldKind;
  /**
   * What the student sees beside the field: `Domain`, `F(_,_)`, `P`, `a`,
   * `_ < _`. Carnap shows the symbol with its terms blanked. Display only:
   * nothing is keyed by it or compared against it.
   */
  readonly label: string;
  /** The bare symbol, without the blanks: `F`, `P`, `a`, `f`. */
  readonly symbol: string;
}

/** The label Carnap gives the domain field, and the spelling givens use for it. */
export const DOMAIN_FIELD_LABEL = "Domain";

/** The domain's key in givens. */
export const DOMAIN_FIELD_KEY = "domain";

export const DOMAIN_FIELD: ModelField = {
  arity: 0,
  key: DOMAIN_FIELD_KEY,
  kind: "domain",
  label: DOMAIN_FIELD_LABEL,
  symbol: DOMAIN_FIELD_LABEL,
};

/**
 * A field's key: its kind and {@link symbolKey}. The kind is part of it so
 * that a key names its field on its own — a playground's givens are the whole
 * of its vocabulary, and are read back with {@link fieldFromKey} — and so that
 * a variable and a constant can never share one.
 */
export function fieldKey(
  kind: KeyedKind,
  symbol: string,
  arity: number,
): string {
  return `${kind} ${symbolKey(symbol, arity)}`;
}

type KeyedKind = Exclude<ModelFieldKind, "domain">;

function makeField(
  kind: KeyedKind,
  symbol: string,
  arity: number,
  lang: SurfaceLanguage,
): ModelField {
  return {
    arity,
    key: fieldKey(kind, symbol, arity),
    kind,
    label:
      kind === "variable"
        ? termToString({ name: symbol, type: "variable" }, lang)
        : blankedLabel(symbol, arity, lang),
    symbol,
  };
}

const KEYED_KINDS: ReadonlySet<string> = new Set<KeyedKind>([
  "relation",
  "proposition",
  "constant",
  "variable",
  "function",
]);

function isKeyedKind(kind: string): kind is KeyedKind {
  return KEYED_KINDS.has(kind);
}

/**
 * The field a key names, labelled in the language; `null` for anything that is
 * not a key {@link fieldKey} could have written.
 */
export function fieldFromKey(
  key: string,
  lang: SurfaceLanguage,
): ModelField | null {
  if (key === DOMAIN_FIELD_KEY) {
    return DOMAIN_FIELD;
  }

  const match = /^(\S+) (.+)\/(\d+)$/.exec(key);
  const kind = match?.[1] ?? "";
  const symbol = match?.[2] ?? "";
  const arity = Number(match?.[3]);

  if (!isKeyedKind(kind) || symbol === "") {
    return null;
  }

  const nullary =
    kind === "proposition" || kind === "constant" || kind === "variable";

  return nullary === (arity === 0)
    ? makeField(kind, symbol, arity, lang)
    : null;
}

/**
 * `F` with arity 2 → `F(_,_)`; arity 0 → `F`. A symbol the spec gives a
 * notation is labelled *through* it — `lt` written `<` is `_ < _`, and a
 * notated constant `zero` is `0` — because the label is what the exercise
 * shows beside the sentences, and a student reading `x < a` should not have to
 * work out that the table headed `lt(_,_)` is the same symbol.
 *
 * Blanking the arguments is printing the symbol applied to blanks, so that is
 * how a notated symbol is done: one printer decides how it is written, here
 * and in the sentences both. A lexicon letter keeps the bracketed `F(_,_)`
 * even where the language juxtaposes its arguments: a blank is not a term,
 * and glued blanks need a space to stay two (`R_ _`), where the bracketed form
 * says the arity at a glance and is one Magnus and UBC read as well.
 */
export function blankedLabel(
  symbol: string,
  arity: number,
  lang: SurfaceLanguage,
): string {
  if (arity > 0 && !lang.canonical.has(symbol)) {
    return `${symbol}(${Array(arity).fill("_").join(",")})`;
  }

  return termToString(
    arity === 0
      ? { name: symbol, type: "constant" }
      : {
          args: Array.from(
            { length: arity },
            () => ({ name: "_", type: "variable" }) as const,
          ),
          name: symbol,
          type: "function",
        },
    lang,
  );
}

/** A symbol's key in a model, distinguishing arities of the same letter. */
export { symbolKey };

function collectFromTerm(
  term: Term,
  into: Map<string, ModelField>,
  lang: SurfaceLanguage,
  bound: ReadonlySet<string>,
): void {
  if (term.type === "variable") {
    if (!bound.has(term.name)) {
      const found = makeField("variable", term.name, 0, lang);
      into.set(found.key, found);
    }

    return;
  }

  if (term.type === "constant") {
    const found = makeField("constant", term.name, 0, lang);
    into.set(found.key, found);
    return;
  }

  const found = makeField("function", term.name, term.args.length, lang);
  into.set(found.key, found);

  for (const argument of term.args) {
    collectFromTerm(argument, into, lang, bound);
  }
}

function collectFromFormula(
  formula: Formula,
  into: Map<string, ModelField>,
  lang: SurfaceLanguage,
  bound: ReadonlySet<string>,
): void {
  switch (formula.type) {
    case "predicate": {
      const arity = formula.args.length;
      const found = makeField(
        arity === 0 ? "proposition" : "relation",
        formula.name,
        arity,
        lang,
      );
      into.set(found.key, found);

      for (const argument of formula.args) {
        collectFromTerm(argument, into, lang, bound);
      }

      return;
    }
    case "identity":
      collectFromTerm(formula.left, into, lang, bound);
      collectFromTerm(formula.right, into, lang, bound);
      return;
    case "falsum":
    case "verum":
      return;
    case "not":
      collectFromFormula(formula.operand, into, lang, bound);
      return;
    case "forall":
    case "exists":
      collectFromFormula(
        formula.body,
        into,
        lang,
        new Set([...bound, formula.variable]),
      );
      return;
    default:
      collectFromFormula(formula.left, into, lang, bound);
      collectFromFormula(formula.right, into, lang, bound);
  }
}

/** The order the fields are shown in, which is Carnap's. */
const KIND_ORDER: readonly ModelFieldKind[] = [
  "domain",
  "relation",
  "proposition",
  "constant",
  "variable",
  "function",
];

/**
 * Every field the formulas need, domain first and then grouped by kind, each
 * group in label order — the sequence `prepareModelUI` builds by appending
 * relations, then propositions, then constants, then functions, sorting each
 * group by its label as it goes. Free variables, which Carnap never has, sit
 * after the constants they are filled in like.
 */
export function modelSignature(
  formulas: readonly Formula[],
  lang: SurfaceLanguage,
  extra: readonly ModelField[] = [],
): readonly ModelField[] {
  const collected = new Map<string, ModelField>(
    extra
      .filter((field) => field.kind !== "domain")
      .map((field) => [field.key, field]),
  );

  for (const formula of formulas) {
    collectFromFormula(formula, collected, lang, new Set());
  }

  const fields = [...collected.values()].sort((left, right) => {
    const byKind =
      KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);

    if (byKind !== 0) {
      return byKind;
    }

    // Code-unit order, not `localeCompare`. Carnap sorts on Haskell's `Ord
    // String`, which is this; and collation would put `F(_,_)` before `F(_)`
    // in a way that depends on the runtime's ICU data, where the order the
    // fields are shown in should be the same in every browser.
    return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
  });

  return [DOMAIN_FIELD, ...fields];
}

/**
 * The field an author's given names, in any spelling the language reads:
 * `F(_,_)` is a two-place relation, `f(_)` a function, `a` a constant, and in
 * a language that writes `lt` as `<`, both `_ < _` and `_<_` name it.
 *
 * Each blank is filled with a different one of the language's names and the
 * result read as a sentence, then as a term. It names a field only if what
 * reads is one symbol applied to exactly those names, in order — so `F(a,_)`,
 * `¬F(_)` and `F(f(_))` name nothing, and nothing the language does not have
 * becomes a field.
 */
export function fieldForGiven(
  given: string,
  lang: SurfaceLanguage,
): ModelField | null {
  if (given === DOMAIN_FIELD_LABEL) {
    return DOMAIN_FIELD;
  }

  const blanks = given.split("_").length - 1;
  const names = languageNames(lang).slice(0, blanks);

  if (names.length < blanks) {
    return null;
  }

  let index = 0;
  const filled = given.replace(/_/g, () => names[index++] ?? "_");
  const blanked = (args: readonly Term[]): boolean =>
    args.length === names.length &&
    args.every(
      (arg, position) =>
        arg.type === "constant" && arg.name === names[position],
    );
  const sentence = parseFormula(filled, lang);

  if (sentence.ok) {
    const formula = sentence.formula;

    return formula.type === "predicate" && blanked(formula.args)
      ? makeField(
          formula.args.length === 0 ? "proposition" : "relation",
          formula.name,
          formula.args.length,
          lang,
        )
      : null;
  }

  const read = parseTerm(filled, lang);

  if (!read.ok) {
    return null;
  }

  const term = read.term;

  if (term.type === "function") {
    return blanked(term.args)
      ? makeField("function", term.name, term.args.length, lang)
      : null;
  }

  return blanks === 0 ? makeField(term.type, term.name, 0, lang) : null;
}
