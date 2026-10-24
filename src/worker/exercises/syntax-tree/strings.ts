/**
 * Every string the syntax-tree widget can show, in the viewer's language: one
 * map for the element's hydration payload and the server-rendered review, as
 * the truth table keeps one, so the two cannot word a verdict differently.
 *
 * Keys are the English source text, which is what the client falls back to.
 * Server-side only: what the element needs from here is the ids, as a type,
 * and the tables in `words.ts` that pick among them.
 */

import { buildExerciseHelpStrings } from "../../exercise-kit/help-strings";
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
    ...buildExerciseHelpStrings(i18n),
    // ——— Help: the (?) panel, which holds the instructions.
    "Splitting a syntax tree": i18n.t("Splitting a syntax tree"),
    "Pick the main connective of each sentence until only atomic sentences remain.":
      i18n.t(
        "Pick the main connective of each sentence until only atomic sentences remain.",
      ),
    "Each sentence still to split is boxed, and its connectives are buttons.":
      i18n.t(
        "Each sentence still to split is boxed, and its connectives are buttons.",
      ),
    "Each sentence or term still to split is boxed, and its symbols are buttons.":
      i18n.t(
        "Each sentence or term still to split is boxed, and its symbols are buttons.",
      ),
    "To link a variable, press it, then press the quantifier that binds it, or Free if none does.":
      i18n.t(
        "To link a variable, press it, then press the quantifier that binds it, or Free if none does.",
      ),
    // The scoring rule, under scoring="whole" and scoring="partial".
    "A wrong pick starts the tree over.": i18n.t(
      "A wrong pick starts the tree over.",
    ),
    "Each sentence takes one pick. After a wrong one, the tree shows how it really splits.":
      i18n.t(
        "Each sentence takes one pick. After a wrong one, the tree shows how it really splits.",
      ),
    // The key table.
    "Move between the buttons": i18n.t("Move between the buttons"),
    "Press the button under focus": i18n.t("Press the button under focus"),
    "Let go of the variable being linked": i18n.t(
      "Let go of the variable being linked",
    ),
    "Open this help": i18n.t("Open this help"),
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
    // What depth="terms" says instead of the above, where an atom splits at
    // its predicate or function symbol and each variable is linked to the
    // quantifier binding it.
    "Split each sentence and term at its main symbol until only variables and names remain, and link each variable to the quantifier that binds it.":
      i18n.t(
        "Split each sentence and term at its main symbol until only variables and names remain, and link each variable to the quantifier that binds it.",
      ),
    "That is not the main symbol. The tree starts over.": i18n.t(
      "That is not the main symbol. The tree starts over.",
    ),
    "That is not the main symbol. Here is how it splits.": i18n.t(
      "That is not the main symbol. Here is how it splits.",
    ),
    "Every split and link is correct.": i18n.t(
      "Every split and link is correct.",
    ),
    "Splits and links right: {right} of {total}": i18n.t(
      "Splits and links right: {right} of {total}",
      placeholders("right", "total"),
    ),
    // A variable leaf's button, which starts linking it: its name, then
    // the verb, so the visible letter is in what a screen reader says.
    "Link {variable}": i18n.t("Link {variable}", placeholders("variable")),
    // Said once a variable's button is pressed: the quantifiers above it are
    // now buttons, and so is Free.
    "Pick the quantifier that binds {variable}, or Free.": i18n.t(
      "Pick the quantifier that binds {variable}, or Free.",
      placeholders("variable"),
    ),
    Free: i18n.t(
      "Free (syntax-tree button)",
      {},
      {
        comment:
          "Disambiguating id; only the word Free is shown. A button: the variable being linked is bound by no quantifier.",
        message: "Free",
      },
    ),
    // Written under a variable linked as free; a bound one has a line drawn
    // to its quantifier instead, and this sentence for a screen reader.
    free: i18n.t(
      "free (syntax-tree variable)",
      {},
      {
        comment:
          "Disambiguating id; only the word free is shown. Written under a variable that no quantifier binds.",
        message: "free",
      },
    ),
    "bound by {quantifier}": i18n.t(
      "bound by {quantifier}",
      placeholders("quantifier"),
    ),
    "That is not how this variable is bound. The tree starts over.": i18n.t(
      "That is not how this variable is bound. The tree starts over.",
    ),
    "That is not how this variable is bound. Here is how it is.": i18n.t(
      "That is not how this variable is bound. Here is how it is.",
    ),
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
