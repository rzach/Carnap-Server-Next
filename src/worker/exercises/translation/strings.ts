import { buildExerciseHelpStrings } from "../../exercise-kit/help-strings";
import { placeholders, type Translator } from "../../i18n/translator";
import { buildFormulaParserStrings } from "../../logic/specs/strings";

/**
 * Every string the translation widget can show, in the viewer's language.
 *
 * One list, read on the client side of the boundary: the interactive element
 * takes these out of its hydration payload (see `ExerciseHydration.strings`).
 * The server-rendered review has no verdict to word — equivalence cannot be
 * recomputed without the search engine — so, unlike the model's, its renderer
 * does not read this map.
 *
 * Keys are the English source text, which is what the client falls back to.
 * The literals must sit at the `i18n.t(...)` call sites: Lingui's extractor
 * reads string literals passed to a receiver *named* `i18n`, so hoisting one
 * into a constant would drop it from the catalog silently. A `{slot}` a
 * browser will fill needs `placeholders(...)` to survive this call.
 *
 * The first block is the shared formula parser's own sentences — here rather
 * than only in `diagnostic-strings.ts` because in this type the person typing
 * formulas is the *student*, in the browser, where no catalog ships.
 */
export function buildTranslationStrings(i18n: Translator) {
  return {
    // ——— The parser's sentences, so `t(error.message, params)` on the element
    // resolves every complaint `formulaParseErrors` can raise. One list, shared
    // with the proof types, which read a typed formula the same way.
    ...buildFormulaParserStrings(i18n),

    // ——— The widget's own chrome. No Check: the check is live.
    // The live rendering under the input: what the student's ASCII parses as,
    // in logical symbols. Naming the relation ("reads as") rather than just
    // printing the formula keeps two near-identical strings apart for a
    // screen reader.
    "Reads as {formula}": i18n.t(
      "Reads as {formula}",
      placeholders("formula"),
    ),
    "Your translation": i18n.t("Your translation"),

    // ——— Help: the (?) panel. Each paragraph after the first is shown only
    // where the exercise's variant, feedback and options make it true.
    ...buildExerciseHelpStrings(i18n),
    "Writing a translation": i18n.t("Writing a translation"),
    "Type your translation into the box. Below it, your answer is read back in logical symbols, so you can see how it was understood.":
      i18n.t(
        "Type your translation into the box. Below it, your answer is read back in logical symbols, so you can see how it was understood.",
      ),
    "Use sentence letters and connectives only.": i18n.t(
      "Use sentence letters and connectives only.",
    ),
    "Any sentence logically equivalent to the intended answer counts.":
      i18n.t(
        "Any sentence logically equivalent to the intended answer counts.",
      ),
    "Only the intended sentence counts, though spacing and extra brackets do not matter.":
      i18n.t(
        "Only the intended sentence counts, though spacing and extra brackets do not matter.",
      ),
    // Under feedback="full" and feedback="terse"; under "none" the mark says
    // nothing, and neither does the help.
    "The mark beside Submit shows whether your translation is right, and changes as you type. Press Enter to check at once and see why.":
      i18n.t(
        "The mark beside Submit shows whether your translation is right, and changes as you type. Press Enter to check at once and see why.",
      ),
    "The mark beside Submit shows whether your translation is right, and changes as you type.":
      i18n.t(
        "The mark beside Submit shows whether your translation is right, and changes as you type.",
      ),
    // Where `tests=` limits the answer's form (CNF, at most two negations…),
    // under full feedback, which is when Enter names a broken limit.
    "This exercise also limits the form your answer may take. Press Enter to see whether yours keeps to it.":
      i18n.t(
        "This exercise also limits the form your answer may take. Press Enter to see whether yours keeps to it.",
      ),
    "An answer that cannot be read cannot be submitted.": i18n.t(
      "An answer that cannot be read cannot be submitted.",
    ),
    "Check your translation now": i18n.t("Check your translation now"),

    // ——— Verdicts. The equivalence pair and the exact pair are worded apart
    // because they answer different questions: one "does it say the same
    // thing", the other "is it the very formula".
    "This translation is logically equivalent to the intended answer.":
      i18n.t(
        "This translation is logically equivalent to the intended answer.",
      ),
    "This translation is not equivalent to the intended answer.": i18n.t(
      "This translation is not equivalent to the intended answer.",
    ),
    "This matches the intended answer.": i18n.t(
      "This matches the intended answer.",
    ),
    "This does not exactly match the intended answer.": i18n.t(
      "This does not exactly match the intended answer.",
    ),
    // A prop exercise answered in first-order clothing. Worded about the
    // submission, not the parse: the formula is well-formed, just not in this
    // exercise's language.
    "This exercise wants a propositional sentence: sentence letters and connectives only.":
      i18n.t(
        "This exercise wants a propositional sentence: sentence letters and connectives only.",
      ),

    // ——— The `tests=` sentences, Carnap's own for the normal forms and one
    // per counted feature (a translated language orders "you have N X" its
    // own way per noun, so the noun cannot be a slot).
    "This submission is not in Conjunctive Normal Form.": i18n.t(
      "This submission is not in Conjunctive Normal Form.",
    ),
    "This submission is not in Disjunctive Normal Form.": i18n.t(
      "This submission is not in Disjunctive Normal Form.",
    ),
    "This submission is not in Prenex Normal Form.": i18n.t(
      "This submission is not in Prenex Normal Form.",
    ),
    "You have {count} atomic sentences, but should have {max} at most.":
      i18n.t(
        "You have {count} atomic sentences, but should have {max} at most.",
        placeholders("count", "max"),
      ),
    "You have {count} biconditionals, but should have {max} at most.": i18n.t(
      "You have {count} biconditionals, but should have {max} at most.",
      placeholders("count", "max"),
    ),
    "You have {count} conditionals, but should have {max} at most.": i18n.t(
      "You have {count} conditionals, but should have {max} at most.",
      placeholders("count", "max"),
    ),
    "You have {count} conjunctions, but should have {max} at most.": i18n.t(
      "You have {count} conjunctions, but should have {max} at most.",
      placeholders("count", "max"),
    ),
    "You have {count} connectives, but should have {max} at most.": i18n.t(
      "You have {count} connectives, but should have {max} at most.",
      placeholders("count", "max"),
    ),
    "You have {count} disjunctions, but should have {max} at most.": i18n.t(
      "You have {count} disjunctions, but should have {max} at most.",
      placeholders("count", "max"),
    ),
    "You have {count} falsity constants, but should have {max} at most.":
      i18n.t(
        "You have {count} falsity constants, but should have {max} at most.",
        placeholders("count", "max"),
      ),
    "You have {count} negations, but should have {max} at most.": i18n.t(
      "You have {count} negations, but should have {max} at most.",
      placeholders("count", "max"),
    ),

    // ——— Failure modes of the machinery, not of the answer.
    "The equivalence checker could not load. Your work is safe; check again in a moment.":
      i18n.t(
        "The equivalence checker could not load. Your work is safe; check again in a moment.",
      ),
    // The `checksyntax` gate: why the submit button refused.
    "This answer does not parse, so it cannot be submitted on an exam.":
      i18n.t(
        "This answer does not parse, so it cannot be submitted on an exam.",
      ),
  };
}

/** Every string id the translation widget may ask for. */
export type TranslationStringId = keyof ReturnType<
  typeof buildTranslationStrings
>;

/**
 * A lookup with an English fallback — `t()` on the element, and the strings
 * map itself on the server. Passing this rather than a {@link Translator} is
 * what keeps the wording usable from the browser, where no i18n runtime and
 * no catalog ship.
 */
export type TranslationStrings = (
  id: TranslationStringId,
  values?: Readonly<Record<string, string>>,
) => string;
