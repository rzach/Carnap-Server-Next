/**
 * The widgets' single-key shortcuts — `p` adds a premise, `?` opens the help,
 * `3` makes a block a triangle — and the switch a reader turns them off with
 * (gh #8, WCAG 2.1.4). A key pressed on its own is a risk for anyone who
 * speaks commands, where a stray word can type one, and for anyone prone to
 * hitting keys they did not mean to; so the profile has one switch for every
 * exercise type, and with it off a letter or digit shortcut answers only with
 * Alt held, which nobody presses by accident. `?` and `+` have no Alt form,
 * since what Alt types with them depends on the layout; each has another way
 * in (the help button, Insert) that stays.
 *
 * The server stamps the reader's setting on the page's root element, the
 * shell's and the content document's alike, and the widgets read it there
 * (`client/components/shortcut-keys.ts`). DOM-free, so the key reading can be
 * tested and shared by the truth tree's key map.
 */

/** The root element's attribute that says single keys are off, as `"off"`. */
export const SINGLE_KEY_SHORTCUTS_ATTRIBUTE = "data-single-key-shortcuts";

/**
 * The root element's attributes for a reader's setting, to spread onto it:
 * none while single keys are on, which is also what a page with no reader
 * gets.
 */
export function singleKeyShortcutsStamp(
  on: boolean,
): Readonly<Record<string, string>> {
  return on ? {} : { [SINGLE_KEY_SHORTCUTS_ATTRIBUTE]: "off" };
}

/** The subset of a keyboard event a key map reads. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  /** The physical key, which shortcuts fall back on: see {@link letterKey}. */
  readonly code?: string;
}

/**
 * Whether a `KeyboardEvent.key` is a character a shortcut could be on —
 * `p`, `?`, `3` — rather than a named key (Enter, an arrow, F8). Space is
 * named here: it presses what has focus, as it does anywhere.
 */
export function isCharacterKey(key: string): boolean {
  return key !== " " && [...key].length === 1;
}

/** The keys a shortcut can be on with Alt held: a letter or a digit. */
const ALT_KEY = /^[a-z0-9]$/u;

/**
 * The letter or digit a press with Alt, Ctrl or Cmd held asks for, or `null`.
 *
 * The letter the layout types decides, so Alt-J is J on Dvorak too, where J
 * is the key QWERTY calls C. The physical key stands in only where the press
 * types no plain letter: on a Mac, Option-C types ç and Option-N is a dead
 * key, on AZERTY the digits are shifted, and on a Cyrillic layout Ctrl-Z
 * types я.
 */
function letterKey(press: KeyPress): string | null {
  const typed = press.key.toLowerCase();

  if (ALT_KEY.test(typed)) {
    return typed;
  }

  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/u.exec(press.code ?? "");

  return physical === null
    ? null
    : (physical[1] ?? physical[2] ?? "").toLowerCase();
}

/**
 * The key a press stands for as a widget shortcut, or `null` for one that is
 * not a shortcut.
 *
 * A named key ({@link isCharacterKey}) comes back as it is, modifiers and
 * all, since it types nothing and so is not what the switch is about. A
 * character key is a shortcut pressed on its own while `singleKeys` is on, or
 * a letter or digit with Alt held either way; Shift may be down for either,
 * which is how `?` and `+` are typed. Letters come back in lower case, so `R`
 * is `r`.
 *
 * With Ctrl or Cmd held a character key is never a shortcut: those are the
 * browser's (Ctrl-R) and the widgets' own undo ({@link undoKey}).
 * AltGr reaches a page as Ctrl with Alt, so the letters it types (ą, ł) are
 * typing too.
 */
export function shortcutKey(
  press: KeyPress,
  singleKeys: boolean,
): string | null {
  const command = press.ctrlKey || press.metaKey;

  // A dead key is the start of a character, not a named key: Option-N on a
  // Mac, which is Alt-N there.
  if (press.altKey && !command && press.key === "Dead") {
    return letterKey(press);
  }

  if (!isCharacterKey(press.key)) {
    return press.key;
  }

  if (command) {
    return null;
  }

  if (press.altKey) {
    return letterKey(press);
  }

  return singleKeys ? press.key.toLowerCase() : null;
}

/**
 * The undo or redo a press asks for — Ctrl-Z, Ctrl-Shift-Z or Ctrl-Y, with
 * Cmd for Ctrl on a Mac — or `null`. The letter is read as {@link letterKey}
 * reads it. AltGr reaches a page as Ctrl with Alt, and types a letter rather
 * than undoing. The switch has no say here: these are not single keys.
 */
export function undoKey(press: KeyPress): "redo" | "undo" | null {
  if (!(press.ctrlKey || press.metaKey) || press.altKey) {
    return null;
  }

  const key = letterKey(press);

  if (key === "z") {
    return press.shiftKey ? "redo" : "undo";
  }

  return key === "y" ? "redo" : null;
}

/**
 * A help dialog's listing of a shortcut's keys as the setting has them: a
 * single key while single keys are on; with them off, its Alt form, or
 * nothing for `?` and `+`, which have none. Every other label is kept. An
 * empty result means the shortcut is not on the keyboard at all, and the
 * dialog leaves the row out.
 */
export function shortcutKeyLabels(
  keys: readonly string[],
  singleKeys: boolean,
): readonly string[] {
  if (singleKeys) {
    return keys;
  }

  const labels = keys.flatMap((key) =>
    ALT_KEY.test(key)
      ? [`Alt-${key.toUpperCase()}`]
      : key === "?" || key === "+"
        ? []
        : [key],
  );

  return [...new Set(labels)];
}
