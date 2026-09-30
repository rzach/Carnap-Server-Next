/**
 * What a row of a truth tree develops into, under a {@link TableauSystem}.
 *
 * A row is `A∘B`, a negation of one, a double negation, a quantified sentence
 * or the negation of one, or a literal. Literals have no rule. The binary
 * connectives' rules are their forcing sets: `A∘B` gives one branch per
 * smallest set of values for `A` and `B` that makes `A∘B` true, and `¬(A∘B)`
 * one per set that makes it false, where a part that must be true is written
 * as itself and one that must be false as its negation. A quantifier's rule
 * gives an instance, whose name the checker finds and judges. Identity's
 * rule cites two rows rather than developing one, so the checker judges it
 * itself.
 *
 * DOM-free and free of i18n.
 */

import type { Formula } from "../../../exercise-kit/formula";
import { forcingSets } from "../../../exercise-kit/formula";
import type { BinaryConnective } from "../../../logic/specs/connectives";
import type { QuantifierRule, TableauSystem } from "./system";

export type QuantifierKind = "exists" | "forall" | "notExists" | "notForall";

/** What a rule is named in the margin: its connective, and whether negated. */
export interface RuleName {
  readonly head:
    | { readonly type: "binary"; readonly connective: BinaryConnective }
    | { readonly type: "not" }
    | { readonly type: "forall" }
    | { readonly type: "exists" }
    /** Substitution by an identity, which cites two rows. */
    | { readonly type: "identity" };
  readonly negated: boolean;
}

export type Rule =
  /** A literal, or a row the system gives no rule. */
  | { readonly type: "none" }
  /** Rows the rule writes: one list per branch, a single list for a stack. */
  | {
      readonly type: "branches";
      readonly name: RuleName;
      readonly branches: readonly (readonly Formula[])[];
    }
  | {
      readonly type: "quantifier";
      readonly name: RuleName;
      readonly kind: QuantifierKind;
      readonly rule: QuantifierRule;
      readonly variable: string;
      readonly body: Formula;
    };

const negate = (formula: Formula): Formula => ({
  operand: formula,
  type: "not",
});

function binaryBranches(
  connective: BinaryConnective,
  left: Formula,
  right: Formula,
  value: boolean,
): readonly (readonly Formula[])[] | null {
  const sets = forcingSets(connective, value);

  // `null` is a connective no values can make take this value otherwise
  // (the row needs nothing), and `[]` one no values can make take it at all.
  // Neither is a rule a textbook writes.
  if (sets === null || sets.length === 0) {
    return null;
  }

  return sets.map((set) => {
    const parts: Formula[] = [];

    if (set[0] !== null) {
      parts.push(set[0] ? left : negate(left));
    }

    if (set[1] !== null) {
      parts.push(set[1] ? right : negate(right));
    }

    return parts;
  });
}

/** The rule a row's formula develops by, under a system. */
export function ruleFor(formula: Formula, system: TableauSystem): Rule {
  if (formula.type === "forall" || formula.type === "exists") {
    const kind = formula.type;

    return {
      body: formula.body,
      kind,
      name: { head: { type: kind }, negated: false },
      rule: system.quantifiers[kind],
      type: "quantifier",
      variable: formula.variable,
    };
  }

  if ("left" in formula && formula.type !== "identity") {
    const branches = binaryBranches(
      formula.type,
      formula.left,
      formula.right,
      true,
    );

    return branches === null
      ? { type: "none" }
      : {
          branches,
          name: {
            head: { connective: formula.type, type: "binary" },
            negated: false,
          },
          type: "branches",
        };
  }

  if (formula.type !== "not") {
    return { type: "none" };
  }

  const inner = formula.operand;

  if (inner.type === "not") {
    return system.doubleNegation === "resolve"
      ? {
          branches: [[inner.operand]],
          name: { head: { type: "not" }, negated: true },
          type: "branches",
        }
      : { type: "none" };
  }

  if (inner.type === "forall" || inner.type === "exists") {
    const kind = inner.type === "forall" ? "notForall" : "notExists";

    return {
      body: inner.body,
      kind,
      name: { head: { type: inner.type }, negated: true },
      rule: system.quantifiers[kind],
      type: "quantifier",
      variable: inner.variable,
    };
  }

  if ("left" in inner && inner.type !== "identity") {
    const branches = binaryBranches(
      inner.type,
      inner.left,
      inner.right,
      false,
    );

    return branches === null
      ? { type: "none" }
      : {
          branches,
          name: {
            head: { connective: inner.type, type: "binary" },
            negated: true,
          },
          type: "branches",
        };
  }

  return { type: "none" };
}
