/**
 * Satisfaction over a finite structure — the port of
 * `Carnap/src/Carnap/Languages/PureFirstOrder/Semantics.hs`, shared by every
 * type that evaluates first-order formulas.
 *
 * The evaluator asks a {@link Structure} what its symbols mean rather than
 * reading tables, because not every structure stores them. A model exercise's
 * relations are the extensions a student typed, and its adapter is a lookup;
 * a world's relations are computed from where its objects stand, and asking
 * the world directly is cheaper than materialising `Between` over sixteen
 * blocks as four thousand tuples no one reads.
 *
 * Domain elements are naturals, as in the original, and identity is numeric
 * equality on them (`satisfies m TermEq = \t1 t2 -> Form (t1 == t2)`).
 * Nothing here is language-specific: a formula is a formula once parsed.
 *
 * DOM-free and free of any i18n import: the client elements run the same
 * evaluation the worker grades with.
 */

import { applyBinaryConnective } from "../../logic/specs/connectives";
import type { Formula, Term } from "./formula";

/**
 * What a formula can ask of the thing it is evaluated in.
 *
 * `symbol` is always a {@link symbolKey}, so arity is part of a symbol's
 * identity: `F(a)` and `F(a,b)` ask about `F/1` and `F/2`, two symbols that
 * merely share a letter.
 */
export interface Structure {
  /** Non-empty, without repeats. Quantifiers range over exactly this. */
  readonly domain: readonly number[];
  /** The element a constant names, or `undefined` if it names none. */
  constant(name: string): number | undefined;
  /** A sentence letter's truth value. */
  proposition(name: string): boolean;
  /** Whether a relation holds of a tuple of elements. */
  holds(symbol: string, args: readonly number[]): boolean;
  /** A function's value at a tuple, or `undefined` where it has none. */
  apply(symbol: string, args: readonly number[]): number | undefined;
}

/** A symbol's key in a structure, distinguishing arities of the same letter. */
export function symbolKey(symbol: string, arity: number): string {
  return `${symbol}/${arity}`;
}

/**
 * The value of a term under an assignment to the variables.
 *
 * An unbound variable throws. A variable free in an exercise's formulas is
 * given a value before evaluation starts, so reaching this means a caller
 * evaluated without one. Carnap answers the same way — "it doesn't make sense
 * to ask for the semantic value of an unbound variable" — and both are
 * internal-error paths, not anything a student can provoke.
 *
 * A constant or function value the structure does not supply falls back to
 * the first domain element. Every caller validates before evaluating; the
 * fallback keeps evaluation total for a model still being filled in, and keeps
 * the value inside the domain, which Carnap's `Term 0` default does not.
 */
export function evaluateTerm(
  term: Term,
  structure: Structure,
  assignment: ReadonlyMap<string, number>,
): number {
  const fallback = structure.domain[0] ?? 0;

  switch (term.type) {
    case "variable": {
      const value = assignment.get(term.name);

      if (value === undefined) {
        throw new Error(`No assignment for variable '${term.name}'.`);
      }

      return value;
    }
    case "constant":
      return structure.constant(term.name) ?? fallback;
    default: {
      const args = term.args.map((argument) =>
        evaluateTerm(argument, structure, assignment),
      );

      return (
        structure.apply(symbolKey(term.name, term.args.length), args) ??
        fallback
      );
    }
  }
}

/** Whether the structure satisfies the formula under an assignment. */
export function satisfies(
  formula: Formula,
  structure: Structure,
  assignment: ReadonlyMap<string, number> = new Map(),
): boolean {
  switch (formula.type) {
    case "predicate": {
      if (formula.args.length === 0) {
        return structure.proposition(formula.name);
      }

      return structure.holds(
        symbolKey(formula.name, formula.args.length),
        formula.args.map((argument) =>
          evaluateTerm(argument, structure, assignment),
        ),
      );
    }
    case "identity":
      return (
        evaluateTerm(formula.left, structure, assignment) ===
        evaluateTerm(formula.right, structure, assignment)
      );
    case "falsum":
      return false;
    case "verum":
      return true;
    case "not":
      return !satisfies(formula.operand, structure, assignment);
    case "forall":
    case "exists": {
      const extended = new Map(assignment);
      const holds = (element: number): boolean => {
        extended.set(formula.variable, element);
        return satisfies(formula.body, structure, extended);
      };

      return formula.type === "forall"
        ? structure.domain.every(holds)
        : structure.domain.some(holds);
    }
    // Every binary connective is its truth function applied to the two
    // operands' values, which is the whole of what a structure has to say
    // about one — including the twelve past the four a textbook usually takes
    // as primitive. Both operands are evaluated either way: the short-circuit
    // the four used to get was never observable, since evaluation is total.
    default:
      return applyBinaryConnective(
        formula.type,
        satisfies(formula.left, structure, assignment),
        satisfies(formula.right, structure, assignment),
      );
  }
}

function termVariables(
  term: Term,
  bound: ReadonlySet<string>,
  into: Set<string>,
): void {
  if (term.type === "variable") {
    if (!bound.has(term.name)) {
      into.add(term.name);
    }

    return;
  }

  if (term.type === "function") {
    for (const argument of term.args) {
      termVariables(argument, bound, into);
    }
  }
}

function formulaVariables(
  formula: Formula,
  bound: ReadonlySet<string>,
  into: Set<string>,
): void {
  switch (formula.type) {
    case "predicate":
      for (const argument of formula.args) {
        termVariables(argument, bound, into);
      }
      return;
    case "identity":
      termVariables(formula.left, bound, into);
      termVariables(formula.right, bound, into);
      return;
    case "falsum":
    case "verum":
      return;
    case "not":
      formulaVariables(formula.operand, bound, into);
      return;
    case "forall":
    case "exists":
      formulaVariables(
        formula.body,
        new Set([...bound, formula.variable]),
        into,
      );
      return;
    default:
      formulaVariables(formula.left, bound, into);
      formulaVariables(formula.right, bound, into);
  }
}

/**
 * The variables occurring free in a formula, in order of first occurrence
 * reading left to right — the order a satisfying tuple lists its elements in.
 */
export function freeVariables(formula: Formula): readonly string[] {
  const found = new Set<string>();
  formulaVariables(formula, new Set(), found);
  return [...found];
}

/**
 * Every assignment to `variables` under which the formula holds, as tuples in
 * the order `variables` lists them.
 *
 * `outer` fixes any variable the formula has free that `variables` does not
 * name — a subformula's variables bound further out, say, at the values the
 * caller is exploring. A closed formula with no `variables` gives one empty
 * tuple if it is true and none if it is false.
 *
 * The cost is `|domain|^variables.length` evaluations; callers ask about a
 * handful of variables over at most sixteen elements.
 */
export function satisfiers(
  formula: Formula,
  structure: Structure,
  variables: readonly string[],
  outer: ReadonlyMap<string, number> = new Map(),
): readonly (readonly number[])[] {
  const found: number[][] = [];
  const assignment = new Map(outer);
  const tuple: number[] = [];

  const visit = (depth: number): void => {
    const variable = variables[depth];

    if (variable === undefined) {
      if (satisfies(formula, structure, assignment)) {
        found.push([...tuple]);
      }

      return;
    }

    for (const element of structure.domain) {
      assignment.set(variable, element);
      tuple.push(element);
      visit(depth + 1);
      tuple.pop();
    }
  };

  visit(0);

  return found;
}
