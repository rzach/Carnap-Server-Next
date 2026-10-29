import { buildExerciseHelpStrings } from "../../exercise-kit/help-strings";
import { placeholders, type Translator } from "../../i18n/translator";
import { buildFormulaParserStrings } from "../../logic/specs/strings";

/**
 * Every string the model widget can show, in the viewer's language.
 *
 * One list for both sides of the boundary: the interactive element reads these
 * out of its hydration payload (see `ExerciseHydration.strings`), and the
 * server-rendered review view reads the same map directly, so a student who
 * pressed Check before submitting reads back the identical verdict.
 *
 * Keys are the English source text, which is what the client falls back to. The
 * literals must sit at the `i18n.t(...)` call sites: Lingui's extractor reads
 * string literals passed to a receiver *named* `i18n`, so hoisting one into a
 * constant would drop it from the catalog silently. A `{slot}` a browser will
 * fill needs `placeholders(...)` to survive this call.
 *
 * Dependency-free apart from the {@link Translator} type, because
 * `read-only-view.ts` reaches this module and is compiled into the browser
 * preview bundle.
 */
export function buildModelStrings(i18n: Translator) {
  return {
    // What a playground's sentence box can complain about, in the parser's own
    // words: the same sentences the translation widget and the proofs say.
    ...buildFormulaParserStrings(i18n),
    ...buildExerciseHelpStrings(i18n),
    // ——— Help: the (?) panel, which says how to fill in each kind of field.
    // Each paragraph is shown only when the model has a field of its kind.
    "Building a model": i18n.t("Building a model"),
    "Type your sentences first, separated by commas. A field appears below for each symbol they use.":
      i18n.t(
        "Type your sentences first, separated by commas. A field appears below for each symbol they use.",
      ),
    "Type the domain as numbers separated by commas, such as 0,1,2.": i18n.t(
      "Type the domain as numbers separated by commas, such as 0,1,2.",
    ),
    "For a one-place predicate, type the elements it is true of in the same way, such as 0,2.":
      i18n.t(
        "For a one-place predicate, type the elements it is true of in the same way, such as 0,2.",
      ),
    // The notation, shown on the model's own first field of the kind, with a
    // worked tuple, all filled in the browser: {field} is the field's label,
    // `R(_,_)`; {tuple} is `[0,1]`, with {first} and {second} its elements.
    "For a predicate of two or more places, type the tuples it is true of, each in brackets, with the elements in the order of its places. For example, {tuple} in {field} makes it true of {first} in its first place and {second} in its second.":
      i18n.t(
        "For a predicate of two or more places, type the tuples it is true of, each in brackets, with the elements in the order of its places. For example, {tuple} in {field} makes it true of {first} in its first place and {second} in its second.",
        placeholders("field", "first", "second", "tuple"),
      ),
    "Leave a predicate empty to make it true of nothing.": i18n.t(
      "Leave a predicate empty to make it true of nothing.",
    ),
    "Choose True or False for each sentence letter.": i18n.t(
      "Choose True or False for each sentence letter.",
    ),
    "Choose the element each name stands for.": i18n.t(
      "Choose the element each name stands for.",
    ),
    "Choose the element each variable is assigned.": i18n.t(
      "Choose the element each variable is assigned.",
    ),
    // A function's table, explained on the model's own first function of the
    // arity: {field} is its label, `f(_,_)`. For several places, {row} is a
    // row's heading as the table prints it (`0,_`), {column} a column's (`1`),
    // and {argument} the cell they meet at (`0,1`), as a cell's name says it.
    "For a one-place function such as {field}, choose under each element the value it gives for that element.":
      i18n.t(
        "For a one-place function such as {field}, choose under each element the value it gives for that element.",
        placeholders("field"),
      ),
    "For a function of two or more places such as {field}, each row fixes the arguments before the last, and each column the last one. The cell in row {row} and column {column} is its value for {argument}.":
      i18n.t(
        "For a function of two or more places such as {field}, each row fixes the arguments before the last, and each column the last one. The cell in row {row} and column {column} is its value for {argument}.",
        placeholders("argument", "column", "field", "row"),
      ),
    "The lists and tables follow the domain as you change it.": i18n.t(
      "The lists and tables follow the domain as you change it.",
    ),
    "The exercise has filled in some fields for you, and those cannot be changed.":
      i18n.t(
        "The exercise has filled in some fields for you, and those cannot be changed.",
      ),
    "Check says whether the model does what the exercise asks, and if not, what is wrong.":
      i18n.t(
        "Check says whether the model does what the exercise asks, and if not, what is wrong.",
      ),
    "A domain may have at most {max} elements.": i18n.t(
      "A domain may have at most {max} elements.",
      placeholders("max"),
    ),
    Check: i18n.t("Check"),
    // A playground's sentence that will not parse. The parser's own complaint
    // follows it as a second sentence.
    "Could not read the sentence “{sentence}”.": i18n.t(
      "Could not read the sentence “{sentence}”.",
      placeholders("sentence"),
    ),
    "Could not read the value of {field}.": i18n.t(
      "Could not read the value of {field}.",
      placeholders("field"),
    ),
    Domain: i18n.t("Domain"),
    // Carnap's `equiv` failure, which is a property of the set rather than of
    // any one formula, so no formulas are named.
    "Every formula has the same truth value in this model, so it is not a counterexample to equivalence.":
      i18n.t(
        "Every formula has the same truth value in this model, so it is not a counterexample to equivalence.",
      ),
    False: i18n.t("False"),
    // Reachable only through authored givens: a student's value table has a row
    // per argument tuple, so it cannot leave one out or fill one twice.
    "In this model {field} has more than one value for {argument}.": i18n.t(
      "In this model {field} has more than one value for {argument}.",
      placeholders("argument", "field"),
    ),
    "In this model {field} has no value for {argument}.": i18n.t(
      "In this model {field} has no value for {argument}.",
      placeholders("argument", "field"),
    ),
    // The four "take another look" sentences, which are Carnap's own. Which
    // nouns appear depends on the variant: a validity exercise talks about
    // premises and conclusions, the others about formulas and constraints.
    "Not all conclusions are false in this model. Take another look at: {formulas}.":
      i18n.t(
        "Not all conclusions are false in this model. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    "Not all conclusions are true in this model. Take another look at: {formulas}.":
      i18n.t(
        "Not all conclusions are true in this model. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    "Not all formulas are false in this model. Take another look at: {formulas}.":
      i18n.t(
        "Not all formulas are false in this model. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    "Not all formulas are true in this model. Take another look at: {formulas}.":
      i18n.t(
        "Not all formulas are true in this model. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    "Not all of this problem's constraints hold in this model. Take another look at: {formulas}.":
      i18n.t(
        "Not all of this problem's constraints hold in this model. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    "Not all premises are true in this model. Take another look at: {formulas}.":
      i18n.t(
        "Not all premises are true in this model. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    // The accessible name of the `⚠` a field grows while its contents will not
    // read. The glyph alone is not a name.
    "This value cannot be read.": i18n.t("This value cannot be read."),
    "This domain gives {field} too many arguments to fill in.": i18n.t(
      "This domain gives {field} too many arguments to fill in.",
      placeholders("field"),
    ),
    // Carnap says only "Success!"; saying what succeeded is worth the words,
    // because a model exercise has many right answers and a student may not be
    // sure which property theirs turned out to have.
    "This model does everything the exercise asks.": i18n.t(
      "This model does everything the exercise asks.",
    ),
    "The domain cannot be empty.": i18n.t("The domain cannot be empty."),
    "The domain must be a comma-separated list of numbers.": i18n.t(
      "The domain must be a comma-separated list of numbers.",
    ),
    "The extension of {field} is not contained in the domain.": i18n.t(
      "The extension of {field} is not contained in the domain.",
      placeholders("field"),
    ),
    True: i18n.t("True"),
    "Reads as {formula}": i18n.t(
      "Reads as {formula}",
      placeholders("formula"),
    ),
    "Separate sentences with commas.": i18n.t(
      "Separate sentences with commas.",
    ),
    // Under `strictGivens` the model is the author's, and a sentence cannot
    // reach for a symbol it does not interpret.
    "This model gives {symbol} no meaning, so a sentence cannot use it.":
      i18n.t(
        "This model gives {symbol} no meaning, so a sentence cannot use it.",
        placeholders("symbol"),
      ),
    "Write at least one sentence.": i18n.t("Write at least one sentence."),
    Sentences: i18n.t("Sentences"),
    // One field's accessible name. `F(_,_)` on its own says nothing about what
    // to type into it, and the blanks are not read aloud usefully.
    "{field}: the tuples in its extension": i18n.t(
      "{field}: the tuples in its extension",
      placeholders("field"),
    ),
    "{field}: which element it names": i18n.t(
      "{field}: which element it names",
      placeholders("field"),
    ),
    "{field}: which element it is assigned": i18n.t(
      "{field}: which element it is assigned",
      placeholders("field"),
    ),
    "{field}: its truth value": i18n.t(
      "{field}: its truth value",
      placeholders("field"),
    ),
    "{field} of {argument}": i18n.t(
      "{field} of {argument}",
      placeholders("argument", "field"),
    ),
  };
}

/** Every string id the model widget may ask for. */
export type ModelStringId = keyof ReturnType<typeof buildModelStrings>;

/**
 * A lookup with an English fallback — `t()` on the element, and the strings map
 * itself on the server. Passing this rather than a {@link Translator} is what
 * keeps the verdict wording usable from the browser, where no i18n runtime and
 * no catalog ship.
 */
export type ModelStrings = (
  id: ModelStringId,
  values?: Readonly<Record<string, string>>,
) => string;
