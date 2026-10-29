/**
 * The page's side of the single-key switch (see
 * `exercise-kit/shortcut-keys.ts`): the setting, read from the stamp the
 * server put on the root element, and the key and help-listing readers with
 * it applied. A page with no stamp — signed out, say — keeps single keys on,
 * as they have always been.
 */

import {
  type KeyPress,
  SINGLE_KEY_SHORTCUTS_ATTRIBUTE,
  shortcutKey,
  shortcutKeyLabels,
} from "../../worker/exercise-kit/shortcut-keys";

/** Whether this page's reader takes a key pressed on its own as a shortcut. */
export function singleKeyShortcutsOn(): boolean {
  return (
    document.documentElement.getAttribute(SINGLE_KEY_SHORTCUTS_ATTRIBUTE) !==
    "off"
  );
}

/** {@link shortcutKey} under this page's setting. */
export function pageShortcutKey(press: KeyPress): string | null {
  return shortcutKey(press, singleKeyShortcutsOn());
}

/**
 * A help dialog's shortcut rows under this page's setting, each row's keys
 * relabelled by {@link shortcutKeyLabels}; a row left with no key is dropped.
 */
export function pageShortcutRows<
  Row extends { readonly keys: readonly string[] },
>(rows: readonly Row[]): Row[] {
  const singleKeys = singleKeyShortcutsOn();

  return rows
    .map((row) => ({ ...row, keys: shortcutKeyLabels(row.keys, singleKeys) }))
    .filter((row) => row.keys.length > 0);
}
