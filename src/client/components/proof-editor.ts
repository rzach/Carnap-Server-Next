import {
  type Diagnostic,
  forEachDiagnostic,
  nextDiagnostic,
  openLintPanel,
  previousDiagnostic,
  setDiagnostics,
} from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";
import type { ProofEditorStringId } from "../../worker/exercise-kit/proof/editor-strings";
import type { ProofEngineStringId } from "../../worker/exercise-kit/proof/engine-strings";
import {
  createHelpDialog,
  HELP_DIALOG_STYLES,
  mountHelpTrigger,
  openHelpDialog,
} from "./help-dialog";

/**
 * What the two CodeMirror proof editors — linear `.auf` and Fitch — share
 * around their views: the chrome mounted above the action bar, the goal
 * declaration shown in it, the two ways a compiler's diagnostics reach
 * the lint layer, the keys that reach them back out of it, and the help
 * dialog that says so. The pipeline behind the editor is `./proof-element.ts`,
 * shared with the tree and Prawitz islands as well.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** What {@link mountProofEditor} put in the shadow root. */
export interface ProofEditorChrome {
  /** The `.proof` card the server rendered, now without its inert source. */
  readonly container: HTMLElement;
  /** Where the CodeMirror view goes. */
  readonly host: HTMLElement;
  /** The goal row's statement, which a playground rewrites per compile. */
  readonly statement: HTMLElement;
}

/**
 * Replace the server's inert proof source with the editor's chrome: the
 * widget's styles, a goal row (`label` before `statement`, the statement
 * empty in a playground until the proof says what it proves) and an empty
 * host for the view. Both go in above the projected action bar
 * (`slot="exercise-actions"`), which sits at the card's foot, not appended
 * after it. `null` when the card is not there to enhance.
 */
export function mountProofEditor(
  root: ShadowRoot,
  styles: string,
  goal: { readonly label: string; readonly statement: string },
): ProofEditorChrome | null {
  const container = root.querySelector<HTMLElement>(".proof");
  if (container === null) {
    return null;
  }
  root.querySelector(".proof-source")?.remove();

  const style = document.createElement("style");
  style.textContent = styles;
  root.appendChild(style);

  const actionsSlot = container.querySelector<HTMLElement>(
    'slot[name="exercise-actions"]',
  );

  const row = document.createElement("div");
  row.className = "proof-goal";
  const label = document.createElement("span");
  label.className = "proof-goal-label";
  label.textContent = goal.label;
  const statement = document.createElement("span");
  statement.className = "proof-goal-statement";
  statement.textContent = goal.statement;
  // The space is for text readers; the row's gap draws the visible one.
  row.append(label, " ", statement);
  container.insertBefore(row, actionsSlot);

  const host = document.createElement("div");
  host.className = "proof-editor";
  container.insertBefore(host, actionsSlot);

  return { container, host, statement };
}

/** Hand the lint layer what to underline; empty clears it. */
export function showDiagnostics(
  editor: EditorView,
  diagnostics: readonly Diagnostic[],
): void {
  editor.dispatch(setDiagnostics(editor.state, [...diagnostics]));
}

/**
 * The compiler threw before it could report diagnostics: one generic marker
 * at the start of the body rather than a stranded spinner — or none, where
 * `message` is null because detail is withheld.
 */
export function showCompileFailure(
  editor: EditorView,
  message: string | null,
): void {
  showDiagnostics(
    editor,
    message === null
      ? []
      : [
          {
            from: 0,
            message,
            severity: "error",
            to: Math.min(editor.state.doc.length, 1),
          },
        ],
  );
}

/**
 * Whether CodeMirror reads `Mod` as Cmd, by its own test: the help dialog
 * names the keys as they are bound, not as some other platform's are.
 */
const MAC = /Mac/.test(navigator.platform);

/** Either editor's `t()`, narrowed to the text the helpers here say. */
type ProofEditorText = (
  id: ProofEditorStringId | ProofEngineStringId,
) => string;

/**
 * The keys that take a reader to the squiggles without a mouse. A squiggle's
 * message is otherwise only a hover tooltip, which a screen reader never
 * meets.
 *
 * F8 and Shift-F8 step between problems, as they do in the tree and Prawitz
 * editors (`./problem-keys.ts`), and say each one aloud: CodeMirror's own
 * commands select the problem's text and float its tooltip, but announce
 * nothing. Mod-Shift-M opens CodeMirror's problem panel, a list of them all.
 * The help dialog ({@link mountProofEditorHelp}) is where a reader learns of
 * them.
 */
export function problemKeys(t: ProofEditorText): Extension {
  const none = t("No problems.");

  return [
    EditorState.phrases.of({
      close: t("Close"),
      Diagnostics: t("Problems"),
      "No diagnostics": none,
    }),
    keymap.of([
      { key: "F8", run: announcing(nextDiagnostic, none) },
      { key: "Shift-F8", run: announcing(previousDiagnostic, none) },
      { key: "Mod-Shift-m", run: openLintPanel },
    ]),
  ];
}

/**
 * The `(?)` in the action bar and the instructions behind it, as the tree and
 * Prawitz editors have them: the editor's own paragraphs and then the one on
 * reading the verdict, and the keys the two editors share. The problem keys
 * are listed only where `problems` says they are bound — not where feedback
 * withholds the problems.
 *
 * There is no `?` key to open it, as there is on a tree's line: here `?` is
 * something a student may want to type.
 */
export function mountProofEditorHelp(
  element: HTMLElement,
  root: ShadowRoot,
  t: ProofEditorText,
  content: { readonly intro: readonly string[]; readonly title: string },
  problems: boolean,
): void {
  const style = document.createElement("style");
  style.textContent = HELP_DIALOG_STYLES;
  root.appendChild(style);

  const mod = MAC ? "Cmd" : "Ctrl";
  const dialog = createHelpDialog({
    close: t("Close help"),
    intro: [
      ...content.intro,
      t(
        "The mark beside the Submit button shows whether the proof checks. A line with a problem is underlined; hover it, or go to it with F8, to read what is wrong.",
      ),
    ],
    keyboard: t("Keyboard"),
    shortcuts: [
      { action: t("Undo"), keys: [`${mod}-Z`] },
      { action: t("Redo"), keys: [MAC ? "Cmd-Shift-Z" : "Ctrl-Y"] },
      ...(problems
        ? [
            { action: t("Go to the next problem"), keys: ["F8"] },
            { action: t("Go to the previous problem"), keys: ["Shift-F8"] },
            { action: t("List every problem"), keys: [`${mod}-Shift-M`] },
          ]
        : []),
    ],
    title: content.title,
  });
  root.appendChild(dialog);

  mountHelpTrigger(element, t("Usage and keyboard shortcuts"), (trigger) =>
    openHelpDialog(dialog, trigger),
  );
}

/**
 * Run a step between diagnostics, then say what the selection landed on —
 * every message on it, or `none` when there was nowhere to land. The step
 * itself declines when the only problem is already selected; the reader
 * pressed the key to hear it, so it is said again.
 */
function announcing(step: Command, none: string): Command {
  return (view) => {
    step(view);
    const { from, to } = view.state.selection.main;
    const said: string[] = [];
    forEachDiagnostic(view.state, (diagnostic, start, end) => {
      if (start <= from && end >= to) {
        said.push(diagnostic.message);
      }
    });
    view.dispatch({
      effects: EditorView.announce.of(
        said.length > 0 ? said.join(" ") : none,
      ),
    });
    return true;
  };
}
