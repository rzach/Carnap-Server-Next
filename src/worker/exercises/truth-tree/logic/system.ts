/**
 * A textbook's tree rules, as data.
 *
 * Classical truth trees differ from book to book in small, nameable ways:
 * whether a new name must be new to the tree or only to the branch, whether
 * `¬∀xΦ` develops to `¬Φ(a)` or to `∃x¬Φ`, whether a closure cites its rows,
 * when a tree counts as done. A {@link TableauSystem} names those choices, and
 * the checker interprets the record and nothing else, so a second classical
 * textbook is a second record rather than a second checker.
 *
 * The record is stated over connective roles, never spellings: the rules for
 * the binary connectives are derived from their truth functions (the forcing
 * sets), so a language that declares an exotic connective gets rules for it
 * without a table.
 *
 * What a record cannot say (world labels, signs, relation rows, a
 * non-classical closure condition) is left out on purpose. Those systems are
 * other exercise types, reusing the tableau component.
 *
 * DOM-free and free of i18n: the browser checks with it, and the worker
 * grades with it.
 */

/** How one quantifier row develops. */
export interface QuantifierRule {
  /** Whether the instance's name must be new (see `newName`), or may be any. */
  readonly instance: "new" | "any";
  /**
   * `resolved` rows are developed once and ticked (`✓a`); `general` rows can
   * be developed again, for other names (`\a,b`).
   */
  readonly mark: "resolved" | "general";
  /**
   * What the rule writes: an instance, or the negation of one. (A
   * quantifier-exchange system would add a third option, writing the dual
   * quantifier over the negation.)
   */
  readonly yields: "instance" | "negated-instance";
}

export interface TableauSystem {
  readonly id: string;
  /**
   * The binary connectives' rules: one branch per minimal forcing set of the
   * connective at the row's value, so `A ∨ B` splits into `A | B` and
   * `¬(A ∨ B)` stacks `¬A, ¬B`.
   */
  readonly connectives: "forcing-sets";
  /** Whether `¬¬A` develops to `A`. */
  readonly doubleNegation: "resolve" | "none";
  readonly quantifiers: {
    readonly exists: QuantifierRule;
    readonly notForall: QuantifierRule;
    readonly forall: QuantifierRule;
    readonly notExists: QuantifierRule;
  };
  /** Where a "new" name must be new: anywhere in the tree, or on its branch. */
  readonly newName: "tree" | "branch";
  /**
   * What closes a branch: a sentence and its negation, and (with identity) a
   * single row `a≠a`.
   */
  readonly closure: readonly ("complementary" | "self-non-identity")[];
  /** Whether a closure must cite the rows it closes on. */
  readonly closureCitation: "required" | "optional";
  /** Whether a complete open branch has to be marked by the student. */
  readonly openMark: "required" | "optional";
  /**
   * When a tree is done: when every branch is closed or complete, or when
   * every branch is closed or at least one complete open branch is marked.
   */
  readonly finished: "every-branch" | "closed-or-one-complete-open";
  /**
   * What a general row needs on an open branch before the branch is complete:
   * an instance for every name on the branch, and one instance (for some name)
   * on a branch with no names at all.
   */
  readonly completion: {
    readonly general: "every-name-on-branch";
    readonly noNames: "one-instance" | "vacuous";
  };
  /**
   * The rules for identity, or none, and then a row that uses `=` is refused.
   * `a=b` lets any row on its branch be rewritten with every `a` made `b`, or
   * every `b` made `a`, citing both rows and ticking neither; and an open
   * branch is complete only once each of its identities has been substituted,
   * in one direction, into every atomic or negated atomic sentence there
   * (bar a rewriting that says something is itself, `b=b`).
   */
  readonly identity?: {
    readonly substitution: "either-direction";
    readonly completion: "one-direction";
  };
  /** Whether a split's branches may come in either order. */
  readonly branchOrder: "any" | "as-stated";
  /** The most rows a tree may have; first-order trees need not end. */
  readonly rowCap: number;
}

/**
 * *forall x: UBC* (Ichikawa and Jenkins), chapters 5, 10 and 12, as of
 * v2.4.1: a new name is new to its branch, a general sentence needs at least
 * one instance, one complete open branch settles the question (§5.x), and
 * identity has §12.7's substitution rule, completion clause and `a≠a` closure.
 */
export const FORALLX_UBC: TableauSystem = {
  branchOrder: "any",
  closure: ["complementary", "self-non-identity"],
  closureCitation: "required",
  completion: { general: "every-name-on-branch", noNames: "one-instance" },
  connectives: "forcing-sets",
  doubleNegation: "resolve",
  finished: "closed-or-one-complete-open",
  id: "forallx-ubc",
  identity: { completion: "one-direction", substitution: "either-direction" },
  newName: "branch",
  openMark: "required",
  quantifiers: {
    exists: { instance: "new", mark: "resolved", yields: "instance" },
    forall: { instance: "any", mark: "general", yields: "instance" },
    notExists: {
      instance: "any",
      mark: "general",
      yields: "negated-instance",
    },
    notForall: {
      instance: "new",
      mark: "resolved",
      yields: "negated-instance",
    },
  },
  rowCap: 200,
};
