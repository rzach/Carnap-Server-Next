/**
 * A world as a first-order structure, and the binding of a language's symbols
 * to what a world kind says they mean.
 *
 * The language says what a symbol means through a namespaced role: a spec
 * declaring `--| @syntax role blocks.left-of` over `LeftOf` is how
 * `LeftOf(a,b)` comes to be about columns. The binding is by role, never by
 * spelling, so a course can call it `LinksVon` without touching the kind.
 * Arity is part of a symbol's identity, as everywhere a formula is evaluated:
 * the role interprets `LeftOf/2`, and `LeftOf(a,b,c)` is a different symbol
 * that means nothing here.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import type { Formula, Structure, Term } from "../../../exercise-kit/formula";
import {
  hasFirstOrderSignature,
  symbolKey,
} from "../../../exercise-kit/formula";
import { argumentListSort, roleIndex } from "../../../logic/specs/roles";
import type { WorldKind, WorldSymbol } from "../kinds/contract";

/** Why a role in the kind's namespace cannot be bound. */
export type VocabularyProblem =
  | { readonly code: "unknown-role"; readonly role: string }
  | {
      readonly code: "not-first-order";
      readonly role: string;
      readonly symbol: string;
    }
  | {
      readonly code: "wrong-arity";
      readonly role: string;
      readonly symbol: string;
      readonly arity: number;
      readonly declared: number;
    };

export interface WorldVocabulary {
  /** {@link symbolKey} → its meaning. */
  readonly symbols: ReadonlyMap<string, WorldSymbol<unknown>>;
  readonly problems: readonly VocabularyProblem[];
}

const vocabularies = new WeakMap<
  SurfaceLanguage,
  Map<string, WorldVocabulary>
>();

/**
 * How many arguments a constructor takes, or `null` for one that takes an
 * argument list and so any number.
 */
function declaredArity(term: string, lang: SurfaceLanguage): number | null {
  const info = lang.spec.terms.get(term);
  const list = argumentListSort(lang);

  if (info === undefined) {
    return 0;
  }

  return info.binders.some(
    (binder) => "sort" in binder.type && binder.type.sort === list,
  )
    ? null
    : info.binders.length;
}

/** The kind's roles in this language, bound to the symbols that play them. */
export function bindVocabulary(
  kind: WorldKind,
  lang: SurfaceLanguage,
): WorldVocabulary {
  let byKind = vocabularies.get(lang);

  if (byKind === undefined) {
    byKind = new Map();
    vocabularies.set(lang, byKind);
  }

  const cached = byKind.get(kind.id);

  if (cached !== undefined) {
    return cached;
  }

  const symbols = new Map<string, WorldSymbol<unknown>>();
  const problems: VocabularyProblem[] = [];

  for (const [role, term] of roleIndex(lang).rolesIn(kind.roleNamespace)) {
    const meaning = kind.vocabulary.get(role);

    if (meaning === undefined) {
      problems.push({ code: "unknown-role", role });
      continue;
    }

    if (!hasFirstOrderSignature(term, lang)) {
      problems.push({ code: "not-first-order", role, symbol: term });
      continue;
    }

    const declared = declaredArity(term, lang);

    if (declared !== null && declared !== meaning.arity) {
      problems.push({
        arity: meaning.arity,
        code: "wrong-arity",
        declared,
        role,
        symbol: term,
      });
      continue;
    }

    symbols.set(symbolKey(term, meaning.arity), meaning);
  }

  const vocabulary = { problems, symbols };
  byKind.set(kind.id, vocabulary);

  return vocabulary;
}

/** A symbol a formula uses that the world gives no meaning. */
export interface UninterpretedSymbol {
  readonly arity: number;
  readonly name: string;
}

function termSymbols(
  term: Term,
  symbols: ReadonlyMap<string, WorldSymbol<unknown>>,
  into: Map<string, UninterpretedSymbol>,
): void {
  if (term.type !== "function") {
    return;
  }

  const key = symbolKey(term.name, term.args.length);

  if (symbols.get(key)?.kind !== "function") {
    into.set(key, { arity: term.args.length, name: term.name });
  }

  for (const argument of term.args) {
    termSymbols(argument, symbols, into);
  }
}

function formulaSymbols(
  formula: Formula,
  symbols: ReadonlyMap<string, WorldSymbol<unknown>>,
  into: Map<string, UninterpretedSymbol>,
): void {
  switch (formula.type) {
    case "predicate": {
      const key = symbolKey(formula.name, formula.args.length);

      if (symbols.get(key)?.kind !== "relation") {
        into.set(key, { arity: formula.args.length, name: formula.name });
      }

      for (const argument of formula.args) {
        termSymbols(argument, symbols, into);
      }

      return;
    }
    case "identity":
      termSymbols(formula.left, symbols, into);
      termSymbols(formula.right, symbols, into);
      return;
    case "falsum":
    case "verum":
      return;
    case "not":
      formulaSymbols(formula.operand, symbols, into);
      return;
    case "forall":
    case "exists":
      formulaSymbols(formula.body, symbols, into);
      return;
    default:
      formulaSymbols(formula.left, symbols, into);
      formulaSymbols(formula.right, symbols, into);
  }
}

/** Every predicate or function symbol in a formula the world cannot read. */
export function uninterpretedSymbols(
  formula: Formula,
  vocabulary: WorldVocabulary,
): readonly UninterpretedSymbol[] {
  const found = new Map<string, UninterpretedSymbol>();
  formulaSymbols(formula, vocabulary.symbols, found);
  return [...found.values()];
}

function termNames(term: Term, into: Set<string>): void {
  if (term.type === "constant") {
    into.add(term.name);
  } else if (term.type === "function") {
    for (const argument of term.args) {
      termNames(argument, into);
    }
  }
}

function collectNames(formula: Formula, into: Set<string>): void {
  switch (formula.type) {
    case "predicate":
      for (const argument of formula.args) {
        termNames(argument, into);
      }
      return;
    case "identity":
      termNames(formula.left, into);
      termNames(formula.right, into);
      return;
    case "falsum":
    case "verum":
      return;
    case "not":
      collectNames(formula.operand, into);
      return;
    case "forall":
    case "exists":
      collectNames(formula.body, into);
      return;
    default:
      collectNames(formula.left, into);
      collectNames(formula.right, into);
  }
}

/** The names (individual constants) a formula uses, in first-use order. */
export function formulaNames(formula: Formula): readonly string[] {
  const found = new Set<string>();
  collectNames(formula, found);
  return [...found];
}

/** A world read as a structure, and which object each element stands for. */
export interface WorldStructure {
  /** Domain element `i` is the object with id `ids[i]`. */
  readonly ids: readonly string[];
  readonly structure: Structure;
}

/**
 * The structure a world is: its objects, in the kind's order, as the domain;
 * its objects' names as the constants; and the kind's vocabulary, asked
 * directly, as the relations. Nothing is materialised.
 *
 * A world with no objects has an empty domain, where `∀` is vacuously true and
 * `∃` false, which is the honest reading of an empty board. The evaluator's
 * fallback for a constant naming nothing is never reached: every caller checks
 * the names first ({@link formulaNames}).
 */
export function worldStructure(
  kind: WorldKind,
  state: unknown,
  vocabulary: WorldVocabulary,
): WorldStructure {
  const objects = kind.objects(state);
  const ids = objects.map((object) => object.id);
  const named = new Map<string, number>();

  for (const [index, object] of objects.entries()) {
    for (const name of object.names) {
      if (!named.has(name)) {
        named.set(name, index);
      }
    }
  }

  const byId = new Map(ids.map((id, index) => [id, index]));
  const toIds = (args: readonly number[]): string[] =>
    args.map((element) => ids[element] ?? "");

  return {
    ids,
    structure: {
      apply: (symbol, args) => {
        const meaning = vocabulary.symbols.get(symbol);

        return meaning?.kind === "function"
          ? byId.get(meaning.value(state, toIds(args)))
          : undefined;
      },
      constant: (name) => named.get(name),
      domain: ids.map((_, index) => index),
      holds: (symbol, args) => {
        const meaning = vocabulary.symbols.get(symbol);

        return meaning?.kind === "relation"
          ? meaning.holds(state, toIds(args))
          : false;
      },
      proposition: () => false,
    },
  };
}

/** The names a world gives its objects. */
export function worldNames(kind: WorldKind, state: unknown): Set<string> {
  return new Set(kind.objects(state).flatMap((object) => object.names));
}

/**
 * The names the language offers for objects: the tokens of every sort no
 * quantifier binds that reaches the individual sort. For the example blocks
 * language that is `a`–`f`. The editor's names menu lists these.
 */
export function languageNames(lang: SurfaceLanguage): readonly string[] {
  const names: string[] = [];

  for (const info of lang.spec.sorts.values()) {
    if (lang.bindableSorts.has(info.name)) {
      continue;
    }

    const reaches = info.roles.includes("individual")
      ? true
      : [...lang.spec.sorts.values()].some(
          (target) =>
            target.roles.includes("individual") &&
            lang.coerce(info.name, target.name) !== null,
        );

    if (reaches) {
      names.push(...info.vars);
    }
  }

  return names;
}
