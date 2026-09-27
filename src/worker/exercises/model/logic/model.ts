/**
 * Finite models: a model exercise's structure, as plain data.
 *
 * Carnap builds a model out of *functions* (`relation :: Arity -> Int -> ret`)
 * and updates it by wrapping each one in a closure that shadows a single
 * symbol. Here it is plain data, keyed by symbol and arity, which is the same
 * model with the currying taken out. What the formulas *mean* in one is the
 * kit's satisfaction relation (`exercise-kit/formula/semantics.ts`), which a
 * model reaches through {@link modelStructure}: the model is one kind of
 * structure, and a world exercise's picture is another.
 */

import type { Formula, Structure, Term } from "../../../exercise-kit/formula";
import {
  evaluateTerm as evaluateInStructure,
  satisfies as satisfiesInStructure,
} from "../../../exercise-kit/formula";
import { tupleKey } from "./fields";

export interface FiniteModel {
  /** Non-empty, without repeats. Quantifiers range over exactly this. */
  readonly domain: readonly number[];
  /** Constant symbol → the element it names. */
  readonly constants: ReadonlyMap<string, number>;
  /** {@link symbolKey} → argument tuple key → the element it maps to. */
  readonly functions: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** Sentence letter → its truth value. */
  readonly propositions: ReadonlyMap<string, boolean>;
  /** {@link symbolKey} → the tuples in the extension. */
  readonly relations: ReadonlyMap<string, ReadonlySet<string>>;
}

const structures = new WeakMap<FiniteModel, Structure>();

/**
 * The model as a {@link Structure}: every question a lookup in its tables.
 * An absent entry is `false` for a relation or sentence letter and no value
 * for a constant or function, which the evaluator reads as its first-element
 * fallback — the behaviour the model has always had.
 */
export function modelStructure(model: FiniteModel): Structure {
  const cached = structures.get(model);

  if (cached !== undefined) {
    return cached;
  }

  const structure: Structure = {
    apply: (symbol, args) => model.functions.get(symbol)?.get(tupleKey(args)),
    constant: (name) => model.constants.get(name),
    domain: model.domain,
    holds: (symbol, args) =>
      model.relations.get(symbol)?.has(tupleKey(args)) ?? false,
    proposition: (name) => model.propositions.get(name) ?? false,
  };

  structures.set(model, structure);

  return structure;
}

/** The value of a term in a model under an assignment to the variables. */
export function evaluateTerm(
  term: Term,
  model: FiniteModel,
  assignment: ReadonlyMap<string, number>,
): number {
  return evaluateInStructure(term, modelStructure(model), assignment);
}

/** Whether the model satisfies the formula under an assignment. */
export function satisfies(
  formula: Formula,
  model: FiniteModel,
  assignment: ReadonlyMap<string, number> = new Map(),
): boolean {
  return satisfiesInStructure(formula, modelStructure(model), assignment);
}
