import { describe, expect, test } from "bun:test";
import type { JsonValue } from "../../src/worker/domain/json";
import { BLOCKS_SPEC_SOURCE } from "../helpers/blocks-language";
import { dom } from "../helpers/dom";
import {
  compileExercise,
  type MountedExercise as Mounted,
  markState,
  mountExercise,
  publicDataOf,
  statusText,
} from "./mount-exercise";

/**
 * `<carnap-world>`'s side of the widget: that the island replaces the inert
 * board, that every edit goes through the kind's moves and is announced, that
 * a refused move says why, and that the answer the form carries is the world,
 * the marks, or the sentence the variant asks for.
 */

// After `helpers/dom` has installed the globals, so `extends HTMLElement`
// resolves and `register` lands in the window the fixtures are built in.
await import("../../src/client/components/carnap-world-v1");

const LANGUAGE = `:::aufbau-mm0{name="blocks"}\n${BLOCKS_SPEC_SOURCE}:::\n\n`;

function worldExercise(attrs: string, body: string) {
  return compileExercise(
    `${LANGUAGE}::::world{#w system="blocks" ${attrs}}\n${body}\n::::`,
  );
}

const BUILD = [
  "- ∀x(Cube(x) → ∃y LeftOf(y,x))",
  "- false: ∃x Large(x)",
  "| pinned block : small tet at 1,1 named a",
  "| block : large cube at 4,3 named b",
].join("\n");

function answerOf(mounted: Mounted): unknown {
  return JSON.parse(mounted.answerData.value);
}

interface Block {
  readonly id: string;
  readonly size: string;
  readonly col: number;
  readonly row: number;
}

function blocksOf(mounted: Mounted): readonly Block[] {
  return (answerOf(mounted) as { world: { objects: Block[] } }).world.objects;
}

/** Press a key on the board, where the cursor is. */
function press(mounted: Mounted, key: string): void {
  const cell = mounted.root.querySelector<HTMLElement>("td[data-cursor]");

  if (cell === null) {
    throw new Error("no cursor cell");
  }

  cell.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { bubbles: true, key }),
  );
}

/** Press and release a pointer on a square without moving it. */
function tap(cell: Element | null, pointerType: string): void {
  if (cell === null) {
    throw new Error("no such cell");
  }

  for (const type of ["pointerdown", "pointerup"]) {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      button: 0,
    });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    cell.dispatchEvent(event);
  }
}

function announced(mounted: Mounted): string {
  return mounted.root.querySelector("[aria-live]")?.textContent?.trim() ?? "";
}

describe("upgrading", () => {
  test("the island replaces the inert body and mirrors the start world", async () => {
    const fixture = await worldExercise("", BUILD);
    const mounted = mountExercise(fixture);

    expect(mounted.element.dataset.enhanced).toBe("true");
    expect(
      mounted.root.querySelector("fieldset")?.hasAttribute("aria-busy"),
    ).toBe(false);
    expect(mounted.root.querySelector("table[role='grid']")).not.toBeNull();
    expect(answerOf(mounted)).toEqual({
      world: publicDataOf<{ start: unknown }>(fixture).start,
    });
  });

  test("a prior answer is restored", async () => {
    const fixture = await worldExercise("", BUILD);
    const start = publicDataOf<{
      start: { kind: string; objects: Block[] };
    }>(fixture).start;
    const prior = {
      world: {
        ...start,
        objects: start.objects.map((block) =>
          block.id === "o2" ? { ...block, size: "small" } : block,
        ),
      },
    };
    const mounted = mountExercise(fixture, {
      priorAnswer: prior as unknown as JsonValue,
    });

    expect(blocksOf(mounted).find((block) => block.id === "o2")?.size).toBe(
      "small",
    );
  });
});

describe("editing", () => {
  test("keys move the cursor and change the block under it, with an announcement", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));

    for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) {
      press(mounted, key);
    }
    press(mounted, "ArrowDown");
    press(mounted, "ArrowDown");
    press(mounted, "m");

    expect(blocksOf(mounted).find((block) => block.id === "o2")?.size).toBe(
      "medium",
    );
    expect(announced(mounted)).toBe("b is now a medium cube.");
  });

  test("a block is carried with Enter and refused an occupied square", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));

    // To b at 4,3, pick it up, carry it back to a's square at 1,1.
    for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) {
      press(mounted, key);
    }
    press(mounted, "ArrowDown");
    press(mounted, "ArrowDown");
    press(mounted, "Enter");
    expect(announced(mounted)).toContain("Picked up b.");

    for (const key of ["ArrowLeft", "ArrowLeft", "ArrowLeft"]) {
      press(mounted, key);
    }
    press(mounted, "ArrowUp");
    press(mounted, "ArrowUp");
    press(mounted, "Enter");

    expect(announced(mounted)).toBe("Column 1, row 1 already holds a.");
    expect(
      blocksOf(mounted).find((block) => block.id === "o2"),
    ).toMatchObject({ col: 4, row: 3 });
  });

  test("a pinned block cannot be changed", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));

    press(mounted, "Delete");

    expect(blocksOf(mounted)).toHaveLength(2);
    expect(announced(mounted)).toContain("is pinned and cannot be changed.");
  });

  test("the reason the palette is dimmed is shown under the board", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));
    const note = () =>
      mounted.root.querySelector(".world-cursor-note")?.textContent ?? null;

    // The cursor starts on a, which is pinned.
    expect(note()).toBe("a is pinned and cannot be changed.");

    // Off it, the line stays, empty, so the board does not move.
    press(mounted, "ArrowRight");
    expect(note()).toBe("");
  });

  test("a click selects a block, and a tap picks it up", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));
    const b = () =>
      mounted.root.querySelector<HTMLElement>(
        "td[data-col='4'][data-row='3']",
      );

    // A mouse moves with a drag, so its click only moves the cursor.
    tap(b(), "mouse");
    expect(b()?.hasAttribute("data-cursor")).toBe(true);
    expect(b()?.hasAttribute("data-carried")).toBe(false);

    // A finger cannot point without pressing: a tap picks the block up.
    tap(b(), "touch");
    expect(b()?.hasAttribute("data-carried")).toBe(true);

    tap(
      mounted.root.querySelector("td[data-col='5'][data-row='3']"),
      "touch",
    );
    expect(
      blocksOf(mounted).find((block) => block.id === "o2"),
    ).toMatchObject({ col: 5, row: 3 });
  });

  test("undo puts the last change back", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));

    press(mounted, "ArrowRight");
    press(mounted, "+");
    expect(blocksOf(mounted)).toHaveLength(3);

    press(mounted, "z");
    const cell = mounted.root.querySelector<HTMLElement>("td[data-cursor]");
    cell?.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        ctrlKey: true,
        key: "z",
      }),
    );

    expect(blocksOf(mounted)).toHaveLength(2);
  });

  test("the live truth values follow the world", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));
    const values = () =>
      [...mounted.root.querySelectorAll<HTMLElement>(".world-truth")].map(
        (mark) => mark.dataset.value,
      );

    expect(values()).toEqual(["true", "true"]);

    for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) {
      press(mounted, key);
    }
    press(mounted, "ArrowDown");
    press(mounted, "ArrowDown");
    press(mounted, "s");

    expect(values()).toEqual(["true", "false"]);
  });
});

describe("checking", () => {
  test("Check runs the grader's verdict", async () => {
    const mounted = mountExercise(await worldExercise("", BUILD));
    const check =
      mounted.form.querySelector<HTMLButtonElement>(".world-check");

    check?.click();
    expect(statusText(mounted)).toContain("∃xLarge(x)");
    expect(markState(mounted)).toBe("idle");

    for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) {
      press(mounted, key);
    }
    press(mounted, "ArrowDown");
    press(mounted, "ArrowDown");
    press(mounted, "s");
    check?.click();

    expect(statusText(mounted)).toBe(
      "This world does everything the exercise asks.",
    );
    expect(markState(mounted)).toBe("ok");
  });
});

describe("the other variants", () => {
  test("evaluate records one mark per sentence, and shows no live truth", async () => {
    const mounted = mountExercise(
      await worldExercise(
        'variant="evaluate"',
        "- Cube(a)\n- ∃x Tet(x)\n| block : small cube at 2,2 named a",
      ),
    );

    expect(mounted.root.querySelectorAll(".world-truth")).toHaveLength(0);

    const groups = mounted.root.querySelectorAll(".world-marks");
    groups[0]?.querySelectorAll("button")[0]?.click();
    groups[1]?.querySelectorAll("button")[1]?.click();

    expect(answerOf(mounted)).toEqual({ values: [true, false] });
  });

  test("distinguish records the sentence as typed", async () => {
    const mounted = mountExercise(
      await worldExercise(
        'variant="distinguish"',
        "| A block : small cube at 2,2\n| B block : small tet at 2,2",
      ),
    );
    const input =
      mounted.root.querySelector<HTMLInputElement>(".world-answer");

    if (input === null) {
      throw new Error("no sentence input");
    }

    input.value = "∃x Cube(x)";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

    expect(answerOf(mounted)).toEqual({ sentence: "∃x Cube(x)" });
    expect(mounted.root.querySelectorAll("table[role='grid']")).toHaveLength(
      2,
    );
  });

  test("an unreadable sentence is explained once, under the input", async () => {
    const mounted = mountExercise(
      await worldExercise(
        'variant="distinguish"',
        "| A block : small cube at 2,2\n| B block : small tet at 2,2",
      ),
    );
    const input =
      mounted.root.querySelector<HTMLInputElement>(".world-answer");

    if (input === null) {
      throw new Error("no sentence input");
    }

    input.value = "∃x Cube(y)";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    mounted.form.querySelector<HTMLButtonElement>(".world-check")?.click();

    expect(
      mounted.root.querySelector(".world-answer-note")?.textContent,
    ).toContain("free variable");
    expect(statusText(mounted)).toBe("See the note under your sentence.");
  });
});

describe("distinguish's author preview", () => {
  const PAIR = "| A block : small cube at 2,2\n| B block : small tet at 2,2";

  async function preview() {
    return mountExercise(await worldExercise('variant="distinguish"', PAIR), {
      preview: true,
    });
  }

  function board(mounted: Mounted, index: number): HTMLElement {
    const figure =
      mounted.root.querySelectorAll<HTMLElement>(".world-figure")[index];

    if (figure === undefined) {
      throw new Error(`no board ${index}`);
    }

    return figure;
  }

  /** Press a key on one board, where its cursor is. */
  function pressOn(mounted: Mounted, index: number, key: string): void {
    board(mounted, index)
      .querySelector("td[data-cursor]")
      ?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key }),
      );
  }

  function descriptions(mounted: Mounted, index: number): string[] {
    return [...board(mounted, index).querySelectorAll(".world-object")].map(
      (item) => item.textContent ?? "",
    );
  }

  function check(mounted: Mounted, sentence: string): string {
    const input =
      mounted.root.querySelector<HTMLInputElement>(".world-answer");

    if (input === null) {
      throw new Error("no sentence input");
    }

    input.value = sentence;
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    mounted.form.querySelector<HTMLButtonElement>(".world-check")?.click();
    return statusText(mounted);
  }

  test("both worlds are editable, one at a time, through one palette", async () => {
    const mounted = await preview();

    expect(mounted.root.querySelectorAll(".world-palette")).toHaveLength(1);
    expect(board(mounted, 0).hasAttribute("data-active")).toBe(true);

    // The cursor starts on A's 1,1; carry on to its cube and make it large.
    pressOn(mounted, 0, "ArrowRight");
    pressOn(mounted, 0, "ArrowDown");
    pressOn(mounted, 0, "l");
    expect(descriptions(mounted, 0)).toEqual([
      "large cube at column 2, row 2",
    ]);

    // A key on B's board makes B the one being edited, first.
    pressOn(mounted, 1, "ArrowRight");
    pressOn(mounted, 1, "ArrowDown");
    pressOn(mounted, 1, "d");
    expect(board(mounted, 1).hasAttribute("data-active")).toBe(true);
    expect(descriptions(mounted, 1)).toEqual([
      "small dodec at column 2, row 2",
    ]);
    expect(descriptions(mounted, 0)).toEqual([
      "large cube at column 2, row 2",
    ]);

    // Each world keeps its own history.
    board(mounted, 1)
      .querySelector("td[data-cursor]")
      ?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          ctrlKey: true,
          key: "z",
        }),
      );
    expect(descriptions(mounted, 1)).toEqual([
      "small tet at column 2, row 2",
    ]);
    expect(descriptions(mounted, 0)).toEqual([
      "large cube at column 2, row 2",
    ]);
  });

  test("Check judges the worlds as edited", async () => {
    const mounted = await preview();

    expect(check(mounted, "∃x Cube(x)")).toBe(
      "The sentence is true in world A and false in world B.",
    );

    // Copy A over B: the sentence no longer tells them apart.
    mounted.root
      .querySelector<HTMLButtonElement>(".world-copy-across")
      ?.click();
    expect(descriptions(mounted, 1)).toEqual([
      "small cube at column 2, row 2",
    ]);
    expect(announced(mounted)).toBe("World B is now a copy of world A.");
    expect(check(mounted, "∃x Cube(x)")).toBe(
      "The sentence is true in world B.",
    );
  });

  test("Copy as source writes both worlds", async () => {
    const copied: string[] = [];
    const globals = globalThis as Record<string, unknown>;
    const saved = {
      location: globals.location,
      navigator: globals.navigator,
    };
    const mounted = await preview();

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: async (text: string) => {
            copied.push(text);
          },
        },
      },
    });
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "about:srcdoc" },
    });

    try {
      mounted.form
        .querySelector<HTMLButtonElement>(".copy-source")
        ?.dispatchEvent(new dom.window.Event("click"));
      await Promise.resolve();

      expect(copied).toEqual([
        "| A block : small cube at 2,2\n| B block : small tet at 2,2",
      ]);
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          value,
        });
      }
    }
  });

  test("a student's distinguish is not editable", async () => {
    const mounted = mountExercise(
      await worldExercise('variant="distinguish"', PAIR),
    );

    expect(mounted.root.querySelector(".world-palette")).toBeNull();
    expect(mounted.form.querySelector(".copy-source")).toBeNull();
  });
});
