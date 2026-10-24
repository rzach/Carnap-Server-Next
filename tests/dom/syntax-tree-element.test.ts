import { describe, expect, test } from "bun:test";
import type { JsonValue } from "../../src/worker/domain/json";
import {
  compileExercise,
  type MountedExercise,
  markState,
  mountExercise,
  until,
} from "./mount-exercise";

/**
 * `<carnap-syntax-tree>`'s side of the widget: that it enables the sentence's
 * connectives, grows the tree under each right pick, starts over on a wrong
 * one under `whole` and shows the true split under `partial`, takes a typed
 * connective, replays a prior answer, and mirrors the picks into the form.
 *
 * The server draws the tree as a string and the element rebuilds it with DOM
 * calls, so this also holds the class and `data-` names the two share.
 */

await import("../../src/client/components/carnap-syntax-tree-v1");

const PROP = "- P /\\ (R -> ~Q)";

function syntaxTree(body: string, attrs = "#s1") {
  return compileExercise(`::::syntax-tree{${attrs}}\n${body}\n::::`);
}

function connective(
  mounted: MountedExercise,
  node: string,
): HTMLButtonElement {
  const button = mounted.root.querySelector<HTMLButtonElement>(
    `button.st-op[data-node="${node}"]`,
  );

  if (button === null) {
    throw new Error(`No connective button for node “${node}”.`);
  }

  return button;
}

function click(mounted: MountedExercise, node: string): void {
  connective(mounted, node).click();
}

/** A click as a mouse makes it, with a click count; `click()` reports none, as Enter or Space does. */
function mouseClick(button: HTMLElement): void {
  const view = button.ownerDocument.defaultView;

  if (view === null) {
    throw new Error("No window.");
  }

  button.dispatchEvent(
    new view.MouseEvent("click", {
      bubbles: true,
      composed: true,
      detail: 1,
    }),
  );
}

function field(mounted: MountedExercise): HTMLInputElement {
  const input = mounted.root.querySelector<HTMLInputElement>(
    '[data-role="typed"]',
  );

  if (input === null) {
    throw new Error("No typed field.");
  }

  return input;
}

function splitButton(mounted: MountedExercise): HTMLButtonElement | null {
  return mounted.root.querySelector<HTMLButtonElement>('[data-role="split"]');
}

function type(mounted: MountedExercise, text: string): void {
  field(mounted).value = text;
  splitButton(mounted)?.click();
}

function states(mounted: MountedExercise): Record<string, string> {
  return Object.fromEntries(
    [...mounted.root.querySelectorAll<HTMLElement>(".st-node")].map(
      (node) => [node.dataset.path ?? "?", node.dataset.state ?? "?"],
    ),
  );
}

function message(mounted: MountedExercise): string {
  return (
    mounted.root.querySelector('[data-role="message"]')?.textContent ?? ""
  );
}

function picks(mounted: MountedExercise): unknown {
  return (JSON.parse(mounted.answerData.value) as { picks: unknown }).picks;
}

describe("the syntax-tree element", () => {
  test("enables the sentence's connectives and drops aria-busy", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));

    expect(mounted.element.dataset.enhanced).toBe("true");
    expect(mounted.root.querySelector("fieldset[aria-busy]")).toBeNull();
    expect(
      [
        ...mounted.root.querySelectorAll<HTMLButtonElement>("button.st-op"),
      ].map((button) => [button.dataset.node, button.disabled]),
    ).toEqual([
      ["", false],
      ["1", false],
      ["1.1", false],
    ]);
    expect(
      mounted.root
        .querySelector(".st-node[data-target]")
        ?.getAttribute("data-path"),
    ).toBe("");
  });

  test("a right pick splits the sentence, and the last one checks the mark", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));

    click(mounted, "");
    expect(states(mounted)).toEqual({
      "": "split",
      "0": "atom",
      "1": "open",
    });

    click(mounted, "1");
    click(mounted, "1.1");

    expect(states(mounted)).toMatchObject({
      "1.1": "split",
      "1.1.0": "atom",
    });
    expect(markState(mounted)).toBe("ok");
    expect(message(mounted)).toBe("Every connective picked correctly.");
    expect(picks(mounted)).toEqual([
      { clicked: [], node: [] },
      { clicked: [1], node: [1] },
      { clicked: [1, 1], node: [1, 1] },
    ]);
  });

  test("whole: a wrong pick starts the tree over, and says so", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));

    click(mounted, "");
    click(mounted, "1.1");

    expect(states(mounted)).toEqual({ "": "open" });
    expect(picks(mounted)).toEqual([]);
    expect(message(mounted)).toBe(
      "That is not the main connective. The tree starts over.",
    );
    expect(markState(mounted)).toBe("idle");
  });

  test("whole, feedback none: it starts over all the same, without the sentence", async () => {
    const mounted = mountExercise(await syntaxTree(PROP), {
      options: { feedback: "none" },
    });

    click(mounted, "1");

    expect(states(mounted)).toEqual({ "": "open" });
    expect(message(mounted)).toBe("");
  });

  test("partial: a wrong pick stands, and the true split is shown", async () => {
    const mounted = mountExercise(
      await syntaxTree(PROP, '#s2 scoring="partial"'),
    );

    click(mounted, "1");

    expect(states(mounted)).toMatchObject({ "": "split", "1": "open" });
    expect(message(mounted)).toBe(
      "That is not the main connective. Here is how the sentence splits.",
    );

    click(mounted, "1");
    click(mounted, "1.1");

    expect(message(mounted)).toBe("Main connectives found: 2 of 3");
    expect(markState(mounted)).toBe("idle");
  });

  test("a typed connective answers the marked sentence; a non-connective is a slip", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));

    type(mounted, "Q");
    expect(message(mounted)).toBe(
      "“Q” is not a connective of this language.",
    );
    expect(states(mounted)).toEqual({ "": "open" });

    type(mounted, "/\\");
    expect(states(mounted)).toMatchObject({ "": "split", "1": "open" });
    expect(picks(mounted)).toEqual([{ named: "and", node: [] }]);
  });

  test("a prior answer is replayed, and a stored run that went wrong starts over", async () => {
    const fixture = await syntaxTree(PROP);
    const restored = mountExercise(fixture, {
      priorAnswer: {
        picks: [
          { clicked: [], node: [] },
          { clicked: [1], node: [1] },
        ],
      } as JsonValue,
    });

    expect(states(restored)).toMatchObject({ "": "split", "1": "split" });

    const wrong = mountExercise(fixture, {
      priorAnswer: {
        picks: [
          { clicked: [], node: [] },
          { clicked: [1, 1], node: [1] },
        ],
      } as JsonValue,
    });

    expect(states(wrong)).toEqual({ "": "open" });
  });

  test("a connective pressed from the keyboard hands focus to the next sentence's; a typed one keeps it in the field", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));
    const root = connective(mounted, "");

    root.focus();
    root.click();

    expect(mounted.root.activeElement?.getAttribute("data-node")).toBe("1");

    field(mounted).focus();
    type(mounted, "->");

    expect(states(mounted)).toMatchObject({ "1": "split" });
    expect(mounted.root.activeElement).toBe(field(mounted));
  });

  test("a mouse click moves no focus, finished tree or not", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));
    const before = mounted.root.activeElement;

    mouseClick(connective(mounted, ""));
    expect(states(mounted)).toMatchObject({ "": "split" });
    expect(mounted.root.activeElement).toBe(before);

    mouseClick(connective(mounted, "1"));
    mouseClick(connective(mounted, "1.1"));
    expect(markState(mounted)).toBe("ok");
    expect(mounted.root.activeElement).toBe(before);
  });

  test("a tree finished from the keyboard disables the field and moves focus to the message", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));

    click(mounted, "");
    click(mounted, "1");

    const last = connective(mounted, "1.1");

    last.focus();
    last.click();

    expect(mounted.root.activeElement?.getAttribute("data-role")).toBe(
      "message",
    );
    expect(field(mounted).disabled).toBe(true);
    expect(splitButton(mounted)?.disabled).toBe(true);
  });

  test("a second wrong pick in a row is said again, not left unchanged", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));
    const wrong = "That is not the main connective. The tree starts over.";

    click(mounted, "1");
    expect(message(mounted)).toBe(wrong);

    click(mounted, "1");
    expect(message(mounted)).toBe("");

    await until(() => message(mounted) === wrong);
  });

  test("in review mode the connectives stay disabled", async () => {
    const mounted = mountExercise(await syntaxTree(PROP), { mode: "review" });

    expect(
      [
        ...mounted.root.querySelectorAll<HTMLButtonElement>("button.st-op"),
      ].every((button) => button.disabled),
    ).toBe(true);
  });
});
