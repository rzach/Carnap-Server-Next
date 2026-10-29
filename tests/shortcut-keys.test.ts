import { describe, expect, test } from "bun:test";
import { keyAction } from "../src/client/components/truth-tree-keys";
import {
  type KeyPress,
  shortcutKey,
  shortcutKeyLabels,
  undoKey,
} from "../src/worker/exercise-kit/shortcut-keys";

/**
 * The single-key switch (gh #8): which presses a widget takes as shortcuts
 * with single keys on and off, and how the help dialogs list them.
 */

function press(key: string, extra: Partial<KeyPress> = {}): KeyPress {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...extra,
  };
}

describe("shortcutKey", () => {
  test("a key pressed on its own is a shortcut only while single keys are on", () => {
    expect(shortcutKey(press("p"), true)).toBe("p");
    expect(shortcutKey(press("?", { shiftKey: true }), true)).toBe("?");
    expect(shortcutKey(press("3"), true)).toBe("3");
    expect(shortcutKey(press("p"), false)).toBeNull();
    expect(shortcutKey(press("?", { shiftKey: true }), false)).toBeNull();
  });

  test("a letter comes back in lower case, so Shift-R is r", () => {
    expect(shortcutKey(press("R", { shiftKey: true }), true)).toBe("r");
  });

  test("a letter or digit with Alt is a shortcut either way, by the letter the layout types", () => {
    for (const singleKeys of [true, false]) {
      expect(
        shortcutKey(press("p", { altKey: true, code: "KeyP" }), singleKeys),
      ).toBe("p");
      // Dvorak types j on the key QWERTY calls C.
      expect(
        shortcutKey(press("j", { altKey: true, code: "KeyC" }), singleKeys),
      ).toBe("j");
    }
  });

  test("where Alt types no plain letter or digit, the physical key stands in", () => {
    // A Mac's Option-C writes ç, and Option-N is a dead key.
    expect(
      shortcutKey(press("ç", { altKey: true, code: "KeyC" }), false),
    ).toBe("c");
    expect(
      shortcutKey(press("Dead", { altKey: true, code: "KeyN" }), false),
    ).toBe("n");
    expect(
      shortcutKey(press("£", { altKey: true, code: "Digit3" }), false),
    ).toBe("3");
    // AZERTY's 1 key types & unshifted.
    expect(
      shortcutKey(press("&", { altKey: true, code: "Digit1" }), false),
    ).toBe("1");
  });

  test("? and + have no Alt form", () => {
    expect(
      shortcutKey(
        press("?", { altKey: true, code: "Slash", shiftKey: true }),
        true,
      ),
    ).toBeNull();
  });

  test("with Ctrl or Cmd, or AltGr, a character key is never a shortcut", () => {
    expect(shortcutKey(press("r", { ctrlKey: true }), true)).toBeNull();
    expect(shortcutKey(press("r", { metaKey: true }), true)).toBeNull();
    // AltGr reaches a page as Ctrl with Alt: Polish AltGr-A types ą.
    expect(
      shortcutKey(
        press("ą", { altKey: true, code: "KeyA", ctrlKey: true }),
        true,
      ),
    ).toBeNull();
  });

  test("named keys and Space pass through as they are, whatever the setting", () => {
    for (const key of ["Enter", "ArrowUp", "Delete", "F8", " "]) {
      expect(shortcutKey(press(key), false)).toBe(key);
    }
    expect(shortcutKey(press("ArrowLeft", { altKey: true }), false)).toBe(
      "ArrowLeft",
    );
  });
});

describe("undoKey", () => {
  test("Ctrl-Z undoes, and Ctrl-Shift-Z and Ctrl-Y redo, with Cmd for Ctrl", () => {
    expect(undoKey(press("z", { ctrlKey: true }))).toBe("undo");
    expect(undoKey(press("z", { metaKey: true }))).toBe("undo");
    expect(undoKey(press("Z", { ctrlKey: true, shiftKey: true }))).toBe(
      "redo",
    );
    expect(undoKey(press("y", { ctrlKey: true }))).toBe("redo");
    expect(undoKey(press("z"))).toBeNull();
    expect(undoKey(press("x", { ctrlKey: true }))).toBeNull();
  });

  test("a layout without the letter falls back on the physical key, and AltGr types", () => {
    expect(undoKey(press("я", { code: "KeyZ", ctrlKey: true }))).toBe("undo");
    expect(
      undoKey(press("ż", { altKey: true, code: "KeyZ", ctrlKey: true })),
    ).toBeNull();
  });
});

describe("shortcutKeyLabels", () => {
  test("with single keys on, the listing is as written", () => {
    expect(shortcutKeyLabels(["p"], true)).toEqual(["p"]);
    expect(shortcutKeyLabels(["Insert", "+"], true)).toEqual(["Insert", "+"]);
  });

  test("with them off, a letter or digit is listed with Alt, and ? and + go", () => {
    expect(shortcutKeyLabels(["p"], false)).toEqual(["Alt-P"]);
    expect(shortcutKeyLabels(["3", "4", "5"], false)).toEqual([
      "Alt-3",
      "Alt-4",
      "Alt-5",
    ]);
    expect(shortcutKeyLabels(["Insert", "+"], false)).toEqual(["Insert"]);
    expect(shortcutKeyLabels(["?"], false)).toEqual([]);
  });

  test("a key already listed with Alt is listed once", () => {
    expect(shortcutKeyLabels(["c", "Alt-C"], false)).toEqual(["Alt-C"]);
  });

  test("named keys and arrows are kept", () => {
    expect(shortcutKeyLabels(["↑", "↓", "Enter", "Ctrl-Z"], false)).toEqual([
      "↑",
      "↓",
      "Enter",
      "Ctrl-Z",
    ]);
  });
});

describe("the truth tree's key map", () => {
  test("c cites and j names the rule, on their own or with Alt", () => {
    expect(keyAction(press("c"), true)).toBe("cite");
    expect(keyAction(press("c", { altKey: true, code: "KeyC" }), true)).toBe(
      "cite",
    );
    // A Mac's Option-C writes ç.
    expect(keyAction(press("ç", { altKey: true, code: "KeyC" }), true)).toBe(
      "cite",
    );
    // Dvorak types j on QWERTY's C, and c on QWERTY's I.
    expect(keyAction(press("j", { altKey: true, code: "KeyC" }), true)).toBe(
      "rule",
    );
    expect(keyAction(press("c", { altKey: true, code: "KeyI" }), true)).toBe(
      "cite",
    );
  });

  test("with single keys off, only the Alt forms act", () => {
    expect(keyAction(press("x"), false)).toBeNull();
    expect(keyAction(press("x", { altKey: true, code: "KeyX" }), false)).toBe(
      "close",
    );
    expect(keyAction(press("ArrowDown"), false)).toBe("down");
    expect(keyAction(press("z", { ctrlKey: true }), false)).toBe("undo");
  });

  test("Tab is left to the page, and Alt with an arrow to the browser", () => {
    expect(keyAction(press("Tab"), true)).toBeNull();
    expect(keyAction(press("ArrowLeft", { altKey: true }), true)).toBeNull();
  });
});
