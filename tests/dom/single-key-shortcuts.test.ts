import { afterEach, describe, expect, test } from "bun:test";
import { SINGLE_KEY_SHORTCUTS_ATTRIBUTE } from "../../src/worker/exercise-kit/shortcut-keys";
import { dom, domDocument } from "../helpers/dom";
import { mountExercise } from "./mount-exercise";
import {
  prawitzButton as button,
  prawitzExercise as exercise,
  prawitzItems as items,
} from "./prawitz-widget";
import { mockProofCompiler } from "./proof-compiler-mock";

/**
 * The single-key switch in a widget (gh #8), on the Prawitz editor, whose
 * keys are the most numerous: with the page stamped off, `a` on a line does
 * nothing, Alt-A still adds an assumption, and the help lists the Alt forms
 * and leaves out `?`, which has none. The key reading itself is
 * `tests/shortcut-keys.test.ts`'s.
 */

await mockProofCompiler();

await import("../../src/client/components/carnap-aufbau-proof-prawitz-v1");

function press(item: HTMLElement, key: string, alt = false): void {
  item.focus();
  item.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      altKey: alt,
      bubbles: true,
      cancelable: true,
      code: `Key${key.toUpperCase()}`,
      key,
    }),
  );
}

/** The help dialog's key cells, row by row. */
function helpKeys(root: ShadowRoot): string[] {
  return Array.from(root.querySelectorAll(".help-shortcuts dt")).map((row) =>
    Array.from(row.querySelectorAll("kbd"))
      .map((kbd) => kbd.textContent)
      .join(" "),
  );
}

afterEach(() => {
  domDocument.documentElement.removeAttribute(SINGLE_KEY_SHORTCUTS_ATTRIBUTE);
});

describe("single-key shortcuts in a widget", () => {
  test("on, as a page with no stamp has them, a lone key acts", async () => {
    const mounted = mountExercise(await exercise());
    button(mounted, "New assumption").click();

    press(items(mounted)[0] as HTMLElement, "a");

    expect(items(mounted)).toHaveLength(2);
    expect(helpKeys(mounted.root)).toContain("a");
    expect(helpKeys(mounted.root)).toContain("?");
  });

  test("off, a lone key does nothing and Alt with it still acts", async () => {
    domDocument.documentElement.setAttribute(
      SINGLE_KEY_SHORTCUTS_ATTRIBUTE,
      "off",
    );
    const mounted = mountExercise(await exercise());
    button(mounted, "New assumption").click();
    const [line] = items(mounted);

    press(line as HTMLElement, "a");

    expect(items(mounted)).toHaveLength(1);

    press(line as HTMLElement, "a", true);

    expect(items(mounted)).toHaveLength(2);
  });

  test("off, the help lists the Alt forms and leaves out ?", async () => {
    domDocument.documentElement.setAttribute(
      SINGLE_KEY_SHORTCUTS_ATTRIBUTE,
      "off",
    );
    const mounted = mountExercise(await exercise());
    const keys = helpKeys(mounted.root);

    expect(keys).toContain("Alt-A");
    expect(keys).not.toContain("a");
    expect(keys).not.toContain("?");
    // Named keys are listed as they were.
    expect(keys).toContain("Enter");
  });
});
