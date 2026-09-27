import { buildCopySourceStrings } from "../../exercise-kit/copy-source-strings";
import { buildExerciseHelpStrings } from "../../exercise-kit/help-strings";
import { placeholders, type Translator } from "../../i18n/translator";
import { buildFormulaParserStrings } from "../../logic/specs/strings";

/**
 * Every string the world widget can show, in the viewer's language: its
 * chrome, the verdicts, and what each world kind says about its objects.
 *
 * One list for both sides of the boundary. The element reads these out of its
 * hydration payload, and the server-rendered review reads the same map, so a
 * student who pressed Check before submitting reads back the identical
 * verdict. Keys are the English source text, which is what the client falls
 * back to; the literals sit at the `i18n.t(...)` call sites because Lingui's
 * extractor reads only literals passed to a receiver named `i18n`, and a slot
 * the browser fills needs `placeholders(...)` to survive the call.
 *
 * Dependency-free apart from the {@link Translator} type and the parser's own
 * sentences, because `read-only-view.ts` reaches this module and is compiled
 * into the browser preview bundle.
 */
export function buildWorldStrings(i18n: Translator) {
  return {
    // ——— The parser's sentences, so a distinguish answer's parse error is
    // worded on the element: there the person typing a formula is a student.
    ...buildFormulaParserStrings(i18n),
    // The frame of the `(?)` dialog, shared by every widget that explains itself.
    ...buildExerciseHelpStrings(i18n),
    ...buildCopySourceStrings(i18n),

    // ——— Chrome.
    Board: i18n.t("Board"),
    Table: i18n.t("Table"),
    Check: i18n.t("Check"),
    Sentences: i18n.t("Sentences"),
    Laws: i18n.t("Laws"),
    "World A": i18n.t("World A"),
    "World B": i18n.t("World B"),
    "Your sentence": i18n.t("Your sentence"),
    "Allowed symbols: {symbols}": i18n.t(
      "Allowed symbols: {symbols}",
      placeholders("symbols"),
    ),
    "Not allowed: {symbols}": i18n.t(
      "Not allowed: {symbols}",
      placeholders("symbols"),
    ),
    "Changes: {used} of {limit}": i18n.t(
      "Changes: {used} of {limit}",
      placeholders("limit", "used"),
    ),
    Premise: i18n.t("Premise"),
    Conclusion: i18n.t("Conclusion"),
    "Make true": i18n.t("Make true"),
    "Make false": i18n.t("Make false"),
    True: i18n.t("True"),
    False: i18n.t("False"),
    "{sentence}: your mark": i18n.t(
      "{sentence}: your mark",
      placeholders("sentence"),
    ),
    "True in this world": i18n.t("True in this world"),
    "False in this world": i18n.t("False in this world"),
    "Cannot be evaluated in this world": i18n.t(
      "Cannot be evaluated in this world",
    ),
    Undo: i18n.t("Undo"),
    Redo: i18n.t("Redo"),
    "Remove block": i18n.t("Remove block"),
    "Add block": i18n.t("Add block"),
    Names: i18n.t("Names"),
    Shape: i18n.t("Shape"),
    Size: i18n.t("Size"),
    Column: i18n.t("Column"),
    Row: i18n.t("Row"),
    Tet: i18n.t("Tet"),
    Cube: i18n.t("Cube"),
    Dodec: i18n.t("Dodec"),
    Small: i18n.t("Small"),
    Medium: i18n.t("Medium"),
    Large: i18n.t("Large"),
    "No blocks yet.": i18n.t("No blocks yet."),
    "Column {col}, row {row}": i18n.t(
      "Column {col}, row {row}",
      placeholders("col", "row"),
    ),
    "Column {col}, row {row}: {block}": i18n.t(
      "Column {col}, row {row}: {block}",
      placeholders("block", "col", "row"),
    ),
    "The world": i18n.t("The world"),
    "Names for {block}": i18n.t("Names for {block}", placeholders("block")),
    "Picked up {block}. Arrow keys carry it, Enter drops it, Escape puts it back.":
      i18n.t(
        "Picked up {block}. Arrow keys carry it, Enter drops it, Escape puts it back.",
        placeholders("block"),
      ),
    "Put {block} back.": i18n.t("Put {block} back.", placeholders("block")),
    "Undid the last change.": i18n.t("Undid the last change."),
    "{block} is pinned and cannot be changed.": i18n.t(
      "{block} is pinned and cannot be changed.",
      placeholders("block"),
    ),

    // ——— Help.
    "Using the world editor": i18n.t("Using the world editor"),
    "Drag a block to move it, or drag a shape from the palette onto a square to add one. On a touch screen, tap a block and then tap a square.":
      i18n.t(
        "Drag a block to move it, or drag a shape from the palette onto a square to add one. On a touch screen, tap a block and then tap a square.",
      ),
    "The table lists every block and can do everything the board does.":
      i18n.t(
        "The table lists every block and can do everything the board does.",
      ),
    "Point at part of a sentence to see what it is true of.": i18n.t(
      "Point at part of a sentence to see what it is true of.",
    ),
    "Move between squares": i18n.t("Move between squares"),
    "Pick up or drop a block": i18n.t("Pick up or drop a block"),
    "Put a carried block back": i18n.t("Put a carried block back"),
    "Make it a tet, cube, or dodec": i18n.t("Make it a tet, cube, or dodec"),
    "Make it small, medium, or large": i18n.t(
      "Make it small, medium, or large",
    ),
    "Name it": i18n.t("Name it"),
    "Add a block here": i18n.t("Add a block here"),
    "Remove it": i18n.t("Remove it"),
    "Undo the last change": i18n.t("Undo the last change"),

    // ——— Highlighting.
    "{formula}: true.": i18n.t("{formula}: true.", placeholders("formula")),
    "{formula}: false.": i18n.t("{formula}: false.", placeholders("formula")),
    "{formula}: satisfied by {objects}.": i18n.t(
      "{formula}: satisfied by {objects}.",
      placeholders("formula", "objects"),
    ),
    "{formula}: satisfied by nothing.": i18n.t(
      "{formula}: satisfied by nothing.",
      placeholders("formula"),
    ),
    "{formula}: witnesses {objects}.": i18n.t(
      "{formula}: witnesses {objects}.",
      placeholders("formula", "objects"),
    ),
    "{formula}: counterexamples {objects}.": i18n.t(
      "{formula}: counterexamples {objects}.",
      placeholders("formula", "objects"),
    ),

    // ——— Verdicts.
    "This world does everything the exercise asks.": i18n.t(
      "This world does everything the exercise asks.",
    ),
    "This world does not yet do everything the exercise asks.": i18n.t(
      "This world does not yet do everything the exercise asks.",
    ),
    "This answer holds no world.": i18n.t("This answer holds no world."),
    "These are pinned and have been changed: {objects}.": i18n.t(
      "These are pinned and have been changed: {objects}.",
      placeholders("objects"),
    ),
    "This world changes {used} objects; the most allowed is {limit}.": i18n.t(
      "This world changes {used} objects; the most allowed is {limit}.",
      placeholders("limit", "used"),
    ),
    "Nothing in this world is named {names}.": i18n.t(
      "Nothing in this world is named {names}.",
      placeholders("names"),
    ),
    "Not every law holds. Take another look at: {formulas}.": i18n.t(
      "Not every law holds. Take another look at: {formulas}.",
      placeholders("formulas"),
    ),
    "Not every sentence comes out as marked. Take another look at: {formulas}.":
      i18n.t(
        "Not every sentence comes out as marked. Take another look at: {formulas}.",
        placeholders("formulas"),
      ),
    "Every sentence is marked correctly.": i18n.t(
      "Every sentence is marked correctly.",
    ),
    "Correct: {correct} of {total}.": i18n.t(
      "Correct: {correct} of {total}.",
      placeholders("correct", "total"),
    ),
    "Correct: {correct} of {total}. Take another look at: {formulas}.":
      i18n.t(
        "Correct: {correct} of {total}. Take another look at: {formulas}.",
        placeholders("correct", "formulas", "total"),
      ),
    "Write a sentence first.": i18n.t("Write a sentence first."),
    "The sentence has free variables: {variables}.": i18n.t(
      "The sentence has free variables: {variables}.",
      placeholders("variables"),
    ),
    "This world gives no meaning to {symbols}.": i18n.t(
      "This world gives no meaning to {symbols}.",
      placeholders("symbols"),
    ),
    "This exercise does not allow {symbols}.": i18n.t(
      "This exercise does not allow {symbols}.",
      placeholders("symbols"),
    ),
    "Not every name in the sentence names something in both worlds: {names}.":
      i18n.t(
        "Not every name in the sentence names something in both worlds: {names}.",
        placeholders("names"),
      ),
    "The sentence is true in world A and false in world B.": i18n.t(
      "The sentence is true in world A and false in world B.",
    ),
    "The sentence is false in world A.": i18n.t(
      "The sentence is false in world A.",
    ),
    "The sentence is true in world B.": i18n.t(
      "The sentence is true in world B.",
    ),
    "The sentence is false in world A and true in world B.": i18n.t(
      "The sentence is false in world A and true in world B.",
    ),
    "The sentence does not tell the two worlds apart.": i18n.t(
      "The sentence does not tell the two worlds apart.",
    ),

    // ——— The blocks world's own words. Whole phrases, because a size and a
    // shape agree in gender in some languages.
    "small tet": i18n.t("small tet"),
    "medium tet": i18n.t("medium tet"),
    "large tet": i18n.t("large tet"),
    "small cube": i18n.t("small cube"),
    "medium cube": i18n.t("medium cube"),
    "large cube": i18n.t("large cube"),
    "small dodec": i18n.t("small dodec"),
    "medium dodec": i18n.t("medium dodec"),
    "large dodec": i18n.t("large dodec"),
    "the block at column {col}, row {row}": i18n.t(
      "the block at column {col}, row {row}",
      placeholders("col", "row"),
    ),
    "{block} at column {col}, row {row}": i18n.t(
      "{block} at column {col}, row {row}",
      placeholders("block", "col", "row"),
    ),
    "{block} at column {col}, row {row}, named {names}": i18n.t(
      "{block} at column {col}, row {row}, named {names}",
      placeholders("block", "col", "names", "row"),
    ),
    "Added a {block} at column {col}, row {row}.": i18n.t(
      "Added a {block} at column {col}, row {row}.",
      placeholders("block", "col", "row"),
    ),
    "Removed {block}.": i18n.t("Removed {block}.", placeholders("block")),
    "Moved {block} to column {col}, row {row}.": i18n.t(
      "Moved {block} to column {col}, row {row}.",
      placeholders("block", "col", "row"),
    ),
    "{block} is now a {kind}.": i18n.t(
      "{block} is now a {kind}.",
      placeholders("block", "kind"),
    ),
    "{block} has no names now.": i18n.t(
      "{block} has no names now.",
      placeholders("block"),
    ),
    "{block} is now named {names}.": i18n.t(
      "{block} is now named {names}.",
      placeholders("block", "names"),
    ),
    "Column {col}, row {row} already holds {block}.": i18n.t(
      "Column {col}, row {row} already holds {block}.",
      placeholders("block", "col", "row"),
    ),
    "That square is off the board.": i18n.t("That square is off the board."),
    "A world may hold at most {max} blocks.": i18n.t(
      "A world may hold at most {max} blocks.",
      placeholders("max"),
    ),
    "{name} already names {block}.": i18n.t(
      "{name} already names {block}.",
      placeholders("block", "name"),
    ),
    "Two blocks share column {col}, row {row}: {block} and {other}.": i18n.t(
      "Two blocks share column {col}, row {row}: {block} and {other}.",
      placeholders("block", "col", "other", "row"),
    ),
    "{name} names both {block} and {other}.": i18n.t(
      "{name} names both {block} and {other}.",
      placeholders("block", "name", "other"),
    ),
    "That block is not in this world.": i18n.t(
      "That block is not in this world.",
    ),
  };
}

/** Every string id the world widget may ask for. */
export type WorldStringId = keyof ReturnType<typeof buildWorldStrings>;
