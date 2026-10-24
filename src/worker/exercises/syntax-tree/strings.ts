/**
 * Every string the syntax-tree widget can show, in the viewer's language: one
 * map for the element's hydration payload and the server-rendered review, as
 * the truth table keeps one, so the two cannot word a verdict differently.
 *
 * Keys are the English source text, which is what the client falls back to.
 * Dependency-free apart from the translator interface and `placeholders`,
 * because the client element reaches this module through `display.ts`.
 */

import { placeholders, type Translator } from "../../i18n/translator";

/**
 * What a translator is told about the role words below. Their ids carry a
 * suffix because the bare words are also MM0 role names, which the theory
 * source on a revision page shows as data.
 */
const CONNECTIVE_NAME_COMMENT =
  "Disambiguating id; only the word is shown. What a connective is called, read after its symbol to a screen reader: “∧, conjunction”.";

export function buildSyntaxTreeStrings(i18n: Translator) {
  return {
    // The instructions above the tree. A sentence still to split is the one
    // whose connectives are buttons.
    "Pick the main connective of each sentence until only atomic sentences remain.":
      i18n.t(
        "Pick the main connective of each sentence until only atomic sentences remain.",
      ),
    // The label of the field a student can type a connective into instead of
    // clicking it, for the sentence that has focus.
    "Main connective": i18n.t("Main connective"),
    // Its own id: "Split" is already in the catalog as an adjective (a split
    // view), and this is the verb on the button that splits the sentence.
    Split: i18n.t(
      "Split (syntax-tree button)",
      {},
      {
        comment:
          "Disambiguating id; only the word Split is shown. A button: split the sentence at the main connective just typed.",
        message: "Split",
      },
    ),
    // Under scoring="whole" a wrong pick starts the tree over: that is the
    // exercise's rule, so the message says so rather than apologising.
    "That is not the main connective. The tree starts over.": i18n.t(
      "That is not the main connective. The tree starts over.",
    ),
    // Under scoring="partial" the pick stands and the true split is shown.
    "That is not the main connective. Here is how the sentence splits.":
      i18n.t(
        "That is not the main connective. Here is how the sentence splits.",
      ),
    // A typed answer that names no connective at all: a slip, which costs
    // nothing. Filled in the browser with what was typed.
    "“{text}” is not a connective of this language.": i18n.t(
      "“{text}” is not a connective of this language.",
      placeholders("text"),
    ),
    "The tree is complete.": i18n.t("The tree is complete."),
    "Every connective picked correctly.": i18n.t(
      "Every connective picked correctly.",
    ),
    // Counted in the browser too, where there is no plural selector, so the
    // numbers stay bare values.
    "Main connectives found: {right} of {total}": i18n.t(
      "Main connectives found: {right} of {total}",
      placeholders("right", "total"),
    ),
    "The tree is not finished.": i18n.t("The tree is not finished."),
    // A connective button's accessible name: its symbol, then what it is,
    // since a sentence cut into buttons reads as fragments ("∧", "(") and a
    // symbol alone is pronounced unpredictably.
    "{symbol}, {role}": i18n.t(
      "{symbol}, {role}",
      placeholders("symbol", "role"),
    ),
    negation: i18n.t(
      "negation (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "negation" },
    ),
    conjunction: i18n.t(
      "conjunction (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "conjunction" },
    ),
    disjunction: i18n.t(
      "disjunction (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "disjunction" },
    ),
    conditional: i18n.t(
      "conditional (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "conditional" },
    ),
    biconditional: i18n.t(
      "biconditional (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "biconditional" },
    ),
    "universal quantifier": i18n.t(
      "universal quantifier (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "universal quantifier" },
    ),
    "existential quantifier": i18n.t(
      "existential quantifier (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "existential quantifier" },
    ),
    necessity: i18n.t(
      "necessity (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "necessity" },
    ),
    possibility: i18n.t(
      "possibility (connective name)",
      {},
      { comment: CONNECTIVE_NAME_COMMENT, message: "possibility" },
    ),
  };
}

export type SyntaxTreeStringId = keyof ReturnType<
  typeof buildSyntaxTreeStrings
>;

/** The role words above, by `@syntax role`; a role not listed has none. */
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
