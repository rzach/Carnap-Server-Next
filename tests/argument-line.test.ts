import { describe, expect, test } from "bun:test";
import type { SurfaceLanguage } from "@aufbau/syntax";
import { splitArgumentLine } from "../src/worker/exercise-kit/formula";
import { languageById } from "../src/worker/logic/specs";

/** The kit's shared argument line, `premises :|-: conclusions`. */

function language(id: string): SurfaceLanguage {
  const found = languageById(id);

  if (found === null) {
    throw new Error(`no language ${id}`);
  }

  return found;
}

describe("splitArgumentLine", () => {
  const calgary = language("forallx-calgary");

  test("splits premises from conclusions, respecting brackets", () => {
    expect(splitArgumentLine("R(a,b), P :|-: Q", calgary)).toEqual({
      conclusions: ["Q"],
      premises: ["R(a,b)", "P"],
    });
  });

  test("groups by the brackets the language declares", () => {
    // Calgary declares `[ ]` as well as `( )`; carnap-prop only `( )`.
    expect(splitArgumentLine("[P, Q] :|-: Q", calgary)?.premises).toEqual([
      "[P, Q]",
    ]);
    expect(
      splitArgumentLine("[P, Q] :|-: Q", language("carnap-prop"))?.premises,
    ).toEqual(["[P", "Q]"]);
  });

  test("drops a leading bullet and empty pieces", () => {
    expect(splitArgumentLine("- :|-: P ∨ ¬P", calgary)).toEqual({
      conclusions: ["P ∨ ¬P"],
      premises: [],
    });
  });

  test("refuses a second turnstile", () => {
    expect(splitArgumentLine("P :|-: Q :|-: R", calgary)).toBeNull();
  });
});
