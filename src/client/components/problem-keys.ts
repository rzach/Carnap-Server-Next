/**
 * F8 and Shift-F8 in the tree and Prawitz proof editors: the keys that step
 * between the lines with a problem, so a reader who cannot see the squiggles
 * — or hover them — can still reach what they say. The two CodeMirror editors
 * bind the same keys to CodeMirror's own diagnostic commands
 * (`./proof-editor.ts`), so all four proof widgets answer one key alike.
 *
 * Each line with a problem carries a hidden note, named by its treeitem's
 * `aria-describedby` (see {@link problemNoteId}): moving focus there says the
 * line and then its problem. The note is hidden rather than visually hidden,
 * because a description is read from a hidden element all the same, and a
 * reader walking the page in browse mode should not meet every message a
 * second time, out of place.
 */

/** The id of the hidden note holding a line's problems, in its shadow root. */
export function problemNoteId(lineId: string): string {
  return `problem-${lineId}`;
}

/** Which way a key steps between problems: F8 forward, Shift-F8 back. */
export function problemStep(event: KeyboardEvent): -1 | 1 | null {
  if (event.key !== "F8" || event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  return event.shiftKey ? -1 : 1;
}

/**
 * Move focus to the next line with a problem after the reader's focus — or
 * the previous one, for a `step` of -1 — wrapping at either end, in document
 * order, which is the order the proof's lines are read and flattened in.
 *
 * Returns what is left to say aloud: nothing when focus moved, since the line's
 * description says it; the note again when the reader is already on the only
 * line with a problem, where focus has nowhere to move and so says nothing;
 * and `none` when no line has one.
 */
export function stepToProblem(
  root: ShadowRoot,
  step: -1 | 1,
  none: string,
): string | null {
  const lines = Array.from(
    root.querySelectorAll<HTMLElement>('[role="treeitem"][aria-describedby]'),
  );
  const here = root.activeElement;
  const toward =
    step === 1
      ? Node.DOCUMENT_POSITION_FOLLOWING
      : Node.DOCUMENT_POSITION_PRECEDING;
  // A line that contains the focus — its own field, being edited — is where
  // the reader already is, and is neither ahead of them nor behind.
  const ahead = lines.filter(
    (line) =>
      here !== null &&
      !line.contains(here) &&
      (here.compareDocumentPosition(line) & toward) !== 0,
  );
  const target =
    step === 1 ? (ahead[0] ?? lines[0]) : (ahead.at(-1) ?? lines.at(-1));

  if (target === undefined) {
    return none;
  }
  if (target === here) {
    const note = root.getElementById(
      target.getAttribute("aria-describedby") ?? "",
    );
    return note?.textContent ?? null;
  }

  target.focus();
  return null;
}

/**
 * A polite live region, inserted into `parent` before `before`, and the
 * function that speaks through it. Visually hidden: it is there to be heard.
 */
export function mountAnnouncer(
  parent: HTMLElement,
  before: Node | null,
): (text: string) => void {
  const region = document.createElement("p");
  region.className = "visually-hidden";
  region.setAttribute("aria-live", "polite");
  parent.insertBefore(region, before);

  return (text) => {
    // A live region that is handed the text it already holds reads nothing,
    // so a repeat — F8 pressed twice on a proof with no problems — is told
    // apart by a trailing space.
    region.textContent = region.textContent === text ? `${text} ` : text;
  };
}
