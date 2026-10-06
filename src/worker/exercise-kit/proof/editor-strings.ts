import type { Translator } from "../../i18n/translator";
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
    "The mark beside the Submit button shows whether the proof checks. A line with a problem is underlined; hover it, or go to it with F8, to read what is wrong.":
      i18n.t(
        "The mark beside the Submit button shows whether the proof checks. A line with a problem is underlined; hover it, or go to it with F8, to read what is wrong.",
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
