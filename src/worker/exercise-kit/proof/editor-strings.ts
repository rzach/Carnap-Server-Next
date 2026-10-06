import { placeholders, type Translator } from "../../i18n/translator";
import { buildExerciseHelpStrings } from "../help-strings";

/**
 * The text the two CodeMirror proof editors — linear `.auf` and Fitch — share
 * around their usage instructions: the help dialog's frame, the key rows both
 * list, the paragraph on reading the verdict and the problems, and
 * CodeMirror's own problem panel (`openLintPanel`), whose phrases are handed
 * in through `EditorState.phrases` (see `client/components/proof-editor.ts`).
 * Each editor's own paragraphs and title are in its own `strings.ts`.
 *
 * The rows and the paragraph are the tree and Prawitz editors' words too, and
 * so one catalog entry each: ids are the English text.
 */
export function buildProofEditorStrings(i18n: Translator) {
  return {
    ...buildExerciseHelpStrings(i18n),
    /** Help: what F8 does. */
    "Go to the next problem": i18n.t("Go to the next problem"),
    /** Help: what Shift-F8 does. */
    "Go to the previous problem": i18n.t("Go to the previous problem"),
    /** Help: what Escape does to a problem's message floated over the proof. */
    "Close the problem message": i18n.t("Close the problem message"),
    /** Help: what Ctrl-Shift-M (Cmd on a Mac) does. */
    "List every problem": i18n.t("List every problem"),
    /** Help: the closing orientation paragraph. */
    "The mark beside the Submit button shows whether the proof checks. A line with a problem is underlined. Hover it to read what is wrong, or press F8 to go to it: the problem then stays below the proof while you fix it.":
      i18n.t(
        "The mark beside the Submit button shows whether the proof checks. A line with a problem is underlined. Hover it to read what is wrong, or press F8 to go to it: the problem then stays below the proof while you fix it.",
      ),
    /** Problem line: where in the editor its problem is. */
    "Line {line}": i18n.t("Line {line}", placeholders("line"), {
      comment:
        "Before a problem shown below a proof: the problem is on line {line} of the proof editor.",
    }),
    /** Problem line: which of the proof's problems it holds. Both values are numbers. */
    "Problem {index} of {count}": i18n.t(
      "Problem {index} of {count}",
      placeholders("index", "count"),
      {
        comment:
          "Beside a problem shown below a proof: it is problem {index} of the {count} problems in the proof, counted in the order F8 visits them.",
      },
    ),
    Redo: i18n.t("Redo"),
    Undo: i18n.t("Undo"),
    /** Accessible name of the problem panel's list. */
    Problems: i18n.t("Problems"),
    /** Accessible name of the problem panel's close button, drawn as ×. */
    Close: i18n.t("Close"),
  };
}

/** What the CodeMirror proof editors' shared help and problem keys can say. */
export type ProofEditorStringId = keyof ReturnType<
  typeof buildProofEditorStrings
>;
