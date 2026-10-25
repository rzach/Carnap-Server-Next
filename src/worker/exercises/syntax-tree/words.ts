/**
 * Which of the strings in `strings.ts` the view and the element pick, by the
 * tree's depth and by a connective's role. Kept apart from that module, which
 * builds the strings and is server-side only, so the element bundles these
 * tables without the builder.
 */

import type { SyntaxTreeDepth } from "./logic/tree";
import type { SyntaxTreeStringId } from "./strings";

/**
 * The words that differ with the depth: down to the atoms a node splits at its
 * main connective, and through the terms at its main symbol, which may be a
 * predicate, `=` or a function symbol.
 */
export const SYNTAX_TREE_DEPTH_WORDS = {
  connectives: {
    allRight: "Every connective picked correctly.",
    boxes:
      "Each sentence still to split is boxed, and its connectives are buttons.",
    count: "Main connectives found: {right} of {total}",
    instructions:
      "Pick the main connective of each sentence until only atomic sentences remain.",
    missed: "You picked {picked}; the main connective is {main}.",
    wrongPartial:
      "That is not the main connective. Here is how the sentence splits.",
    wrongWhole: "That is not the main connective. The tree starts over.",
  },
  terms: {
    allRight: "Every split and link is correct.",
    boxes:
      "Each sentence or term still to split is boxed, and its symbols are buttons.",
    count: "Splits and links right: {right} of {total}",
    instructions:
      "Split each sentence and term at its main symbol until only variables and names remain, and link each variable to the quantifier that binds it.",
    missed: "You picked {picked}; the main symbol is {main}.",
    wrongPartial: "That is not the main symbol. Here is how it splits.",
    wrongWhole: "That is not the main symbol. The tree starts over.",
  },
} as const satisfies Record<
  SyntaxTreeDepth,
  Readonly<Record<string, SyntaxTreeStringId>>
>;

/** The role words in `strings.ts`, by `@syntax role`; a role not listed has none. */
export const SYNTAX_TREE_ROLE_WORDS: Readonly<
  Record<string, SyntaxTreeStringId>
> = {
  biconditional: "biconditional",
  conditional: "conditional",
  conjunction: "conjunction",
  disjunction: "disjunction",
  exists: "existential quantifier",
  forall: "universal quantifier",
  necessity: "necessity",
  negation: "negation",
  possibility: "possibility",
};
