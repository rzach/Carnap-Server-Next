/**
 * Syntactic operations on the {@link Formula} tree: comparing two formulas,
 * listing a formula's names, writing a name in for a variable, and one name
 * in for another.
 *
 * A truth tree is checked with nothing else. Whether a row is the instance a
 * quantifier's rule gives, whether two rows contradict each other, and whether
 * a name is new to a branch are all questions about the shape of formulas, and
 * none of them asks what a formula means.
 *
 * DOM-free and free of i18n, like the rest of the kit's formula code.
 */

import type { Formula, Term } from "./formula";

function sameTerm(a: Term, b: Term): boolean {
  if (a.type !== b.type || a.name !== b.name) {
    return false;
  }

  if (a.type === "function" && b.type === "function") {
    return sameTerms(a.args, b.args);
  }

  return true;
}

function sameTerms(a: readonly Term[], b: readonly Term[]): boolean {
  return (
    a.length === b.length &&
    a.every((term, index) => sameTerm(term, b[index] as Term))
  );
}

/**
 * Whether two formulas are the same formula, symbol for symbol.
 *
 * Bound variables count by their letter, so `∀xFx` and `∀yFy` differ. That is
 * how the textbooks compare the rows of a tree: an instance or a closure has
 * to be written with the variables it has, not an alphabetic variant.
 */
export function sameFormula(a: Formula, b: Formula): boolean {
  switch (a.type) {
    case "predicate":
      return (
        b.type === "predicate" &&
        a.name === b.name &&
        sameTerms(a.args, b.args)
      );
    case "identity":
      return (
        b.type === "identity" &&
        sameTerm(a.left, b.left) &&
        sameTerm(a.right, b.right)
      );
    case "falsum":
    case "verum":
      return a.type === b.type;
    case "not":
      return b.type === "not" && sameFormula(a.operand, b.operand);
    case "forall":
    case "exists":
      return (
        b.type === a.type &&
        a.variable === b.variable &&
        sameFormula(a.body, b.body)
      );
    default:
      return (
        b.type === a.type &&
        "left" in b &&
        sameFormula(a.left, b.left) &&
        sameFormula(a.right, b.right)
      );
  }
}

/** A term with `map` applied to each of its atoms: variables and names. */
function mapTerm(term: Term, map: (atom: Term) => Term): Term {
  return term.type === "function"
    ? { ...term, args: term.args.map((arg) => mapTerm(arg, map)) }
    : map(term);
}

/**
 * A formula with `map` applied to the atoms of every term in it, except under
 * a quantifier binding the letter `bound`.
 */
function mapTerms(
  formula: Formula,
  map: (atom: Term) => Term,
  bound?: string,
): Formula {
  const into = (part: Formula): Formula => mapTerms(part, map, bound);

  switch (formula.type) {
    case "predicate":
      return {
        ...formula,
        args: formula.args.map((arg) => mapTerm(arg, map)),
      };
    case "identity":
      return {
        ...formula,
        left: mapTerm(formula.left, map),
        right: mapTerm(formula.right, map),
      };
    case "falsum":
    case "verum":
      return formula;
    case "not":
      return { ...formula, operand: into(formula.operand) };
    case "forall":
    case "exists":
      return formula.variable === bound
        ? formula
        : { ...formula, body: into(formula.body) };
    default:
      return {
        ...formula,
        left: into(formula.left),
        right: into(formula.right),
      };
  }
}

/**
 * The formula with `by` written in for every free occurrence of `variable`.
 *
 * An occurrence is free where no quantifier inside the formula binds the same
 * letter again, so writing `a` for `x` in `Fx & ∀xGx` gives `Fa & ∀xGx`. The
 * term is not checked for capture: the callers write in names, which have no
 * variables to capture.
 */
export function substitute(
  formula: Formula,
  variable: string,
  by: Term,
): Formula {
  return mapTerms(
    formula,
    (atom) =>
      atom.type === "variable" && atom.name === variable ? by : atom,
    variable,
  );
}

/**
 * The formula with the name `to` written for every occurrence of the name
 * `from`: what a truth tree's identity rule writes from `from = to`. Names are
 * never bound, so every occurrence is replaced.
 */
export function replaceName(
  formula: Formula,
  from: string,
  to: string,
): Formula {
  return mapTerms(formula, (atom) =>
    atom.type === "constant" && atom.name === from
      ? { ...atom, name: to }
      : atom,
  );
}

function termNames(term: Term, into: Set<string>): void {
  if (term.type === "constant") {
    into.add(term.name);
  } else if (term.type === "function") {
    for (const arg of term.args) {
      termNames(arg, into);
    }
  }
}

function formulaNames(formula: Formula, into: Set<string>): void {
  switch (formula.type) {
    case "predicate":
      for (const arg of formula.args) {
        termNames(arg, into);
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
      formulaNames(formula.operand, into);
      return;
    case "forall":
    case "exists":
      formulaNames(formula.body, into);
      return;
    default:
      formulaNames(formula.left, into);
      formulaNames(formula.right, into);
  }
}

/**
 * The names (individual constants) a formula mentions, in order of first
 * occurrence. A function symbol's arguments are searched, but the symbol
 * itself is not a name.
 */
export function namesIn(formula: Formula): readonly string[] {
  const found = new Set<string>();
  formulaNames(formula, found);
  return [...found];
}

function isAtomic(formula: Formula): boolean {
  return (
    formula.type === "predicate" ||
    formula.type === "identity" ||
    formula.type === "falsum" ||
    formula.type === "verum"
  );
}

/** Whether a formula is atomic, or the negation of an atomic formula. */
export function isLiteral(formula: Formula): boolean {
  return (
    isAtomic(formula) || (formula.type === "not" && isAtomic(formula.operand))
  );
}

/** Whether one formula is the negation of the other, in either order. */
export function complementary(a: Formula, b: Formula): boolean {
  return (
    (a.type === "not" && sameFormula(a.operand, b)) ||
    (b.type === "not" && sameFormula(b.operand, a))
  );
}
