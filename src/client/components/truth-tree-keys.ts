/**
 * The truth-tree editor's key map: which tableau action a key press asks
 * for. DOM-free, so the tests read it directly; the setting comes in as an
 * argument rather than from the page.
 */

import {
  isCharacterKey,
  type KeyPress,
  shortcutKey,
  undoKey,
} from "../../worker/exercise-kit/shortcut-keys";
import type { TableauKeyAction } from "../../worker/exercises/truth-tree/tableau/navigate";

const KEYS: Readonly<Record<string, TableauKeyAction>> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  Backspace: "delete",
  Delete: "delete",
  End: "last",
  Enter: "edit",
  F2: "edit",
  Home: "first",
  c: "cite",
  j: "rule",
  o: "open",
  r: "add-row",
  s: "split",
  t: "stack",
  x: "close",
};

/**
 * The action a key press on a row asks for, or `null` for none. A letter
 * counts pressed on its own while `singleKeys` is on, and with Alt held
 * either way (`shortcutKey`): Alt-C and Alt-J are how a row's input, where a
 * plain c or j is typing, cites and names the rule. A named key counts with
 * no Alt, Ctrl or Cmd, so Alt-← is still the browser's Back. Undo and redo
 * are the kit's `undoKey`. Tab is left alone, to leave the tree as it leaves
 * anything.
 */
export function keyAction(
  press: KeyPress,
  singleKeys: boolean,
): TableauKeyAction | null {
  const undo = undoKey(press);

  if (undo !== null) {
    return undo;
  }

  const key = shortcutKey(press, singleKeys);

  if (
    key === null ||
    (!isCharacterKey(key) && (press.altKey || press.ctrlKey || press.metaKey))
  ) {
    return null;
  }

  return KEYS[key] ?? null;
}
