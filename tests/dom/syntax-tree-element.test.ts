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
 * one under `whole` and shows the true split under `partial`, links variables
 * at `depth="terms"`, replays a prior answer, mirrors the picks into the form,
 * and puts its instructions behind the (?).
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

/** The nodes marked as picked wrong, each with what a screen reader is told. */
function missed(mounted: MountedExercise): Record<string, string> {
  return Object.fromEntries(
    [
      ...mounted.root.querySelectorAll<HTMLElement>(".st-node[data-missed]"),
    ].map((node) => [
      node.dataset.path ?? "?",
      node.querySelector(".st-missed-note")?.textContent ?? "",
    ]),
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

  test("partial: a finished tree marks the sentence picked wrong, and says what was picked", async () => {
    const mounted = mountExercise(
      await syntaxTree(PROP, '#s2 scoring="partial"'),
    );

    click(mounted, "1");
    click(mounted, "1");
    click(mounted, "1.1");

    expect(message(mounted)).toBe("Main connectives found: 2 of 3");
    expect(missed(mounted)).toEqual({
      // The language's own spelling, as the buttons' names have it; Fira
      // Code draws -> and /\ as arrow and wedge.
      "": "You picked ->; the main connective is /\\.",
    });
  });

  test("partial, feedback terse: the count stands, but not which sentence was missed", async () => {
    const mounted = mountExercise(
      await syntaxTree(PROP, '#s2 scoring="partial"'),
      { options: { feedback: "terse" } },
    );

    click(mounted, "1");
    click(mounted, "1");
    click(mounted, "1.1");

    expect(message(mounted)).toBe("Main connectives found: 2 of 3");
    expect(missed(mounted)).toEqual({});
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

  test("a connective pressed from the keyboard hands focus to the next sentence's", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));
    const root = connective(mounted, "");

    root.focus();
    root.click();

    expect(mounted.root.activeElement?.getAttribute("data-node")).toBe("1");
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

  test("a tree finished from the keyboard moves focus to the message", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));

    click(mounted, "");
    click(mounted, "1");

    const last = connective(mounted, "1.1");

    last.focus();
    last.click();

    expect(mounted.root.activeElement?.getAttribute("data-role")).toBe(
      "message",
    );
  });

  test("the instructions and keys are behind a (?) in the action bar", async () => {
    const mounted = mountExercise(await syntaxTree(PROP));
    const trigger = mounted.element.querySelector(
      ".exercise-actions .help-trigger",
    );
    const help = mounted.root.querySelector("dialog.help-dialog");

    expect(trigger?.getAttribute("aria-label")).toBe(
      "Usage and keyboard shortcuts",
    );
    expect(help?.textContent).toContain(
      "Pick the main connective of each sentence until only atomic sentences remain.",
    );
    expect(help?.textContent).toContain("A wrong pick starts the tree over.");
    expect(
      [...(help?.querySelectorAll("kbd") ?? [])].map(
        (key) => key.textContent,
      ),
    ).toEqual(["Tab", "Shift-Tab", "Enter", "Space", "?"]);
  });

  test("in review mode there is no (?)", async () => {
    const mounted = mountExercise(await syntaxTree(PROP), { mode: "review" });

    expect(mounted.element.querySelector(".help-trigger")).toBeNull();
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

/** `∀x(F(x) ∧ ∃x G(x))` through its terms: the splits, root first. */
const TERMS = "- Ax(F(x) & Ex G(x))";
const TERM_ATTRS = '#t1 system="forallx-calgary" depth="terms"';
const OUTER_X = "1.0.0.0.0";
const INNER_X = "1.1.1.0.0.0";

function splitAll(mounted: MountedExercise): void {
  for (const key of ["", "1", "1.0", "1.1", "1.1.1"]) {
    click(mounted, key);
  }
}

function variable(mounted: MountedExercise, key: string): HTMLButtonElement {
  const button = mounted.root.querySelector<HTMLButtonElement>(
    `button.st-var[data-node="${key}"]`,
  );

  if (button === null) {
    throw new Error(`No variable button for “${key}”.`);
  }

  return button;
}

function shadowButton(
  mounted: MountedExercise,
  selector: string,
): HTMLElement {
  const button = mounted.root.querySelector<HTMLElement>(selector);

  if (button === null) {
    throw new Error(`No button “${selector}”.`);
  }

  return button;
}

function binders(mounted: MountedExercise): string[] {
  return [
    ...mounted.root.querySelectorAll<HTMLButtonElement>("button.st-bind"),
  ].map((button) => `${button.dataset.node}:${button.textContent}`);
}

function freeButton(mounted: MountedExercise): HTMLElement | null {
  return mounted.root.querySelector<HTMLElement>('[data-role="free"]');
}

describe("the syntax-tree element through its terms", () => {
  test("a variable appears once its atom is split, and pressing it offers every quantifier", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));

    splitAll(mounted);
    expect(states(mounted)).toMatchObject({
      [OUTER_X]: "unlinked",
      [INNER_X]: "unlinked",
    });
    expect(freeButton(mounted)?.hidden).toBe(true);

    // The outer x has only ∀x above it, and is offered ∃x too: offering just
    // the quantifiers whose scope holds it would answer half the question.
    mouseClick(variable(mounted, OUTER_X));

    expect(variable(mounted, OUTER_X).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(binders(mounted)).toEqual([":∀x", "1.1:∃x"]);
    expect(freeButton(mounted)?.hidden).toBe(false);
    expect(message(mounted)).toBe(
      "Pick the quantifier that binds x, or Free.",
    );
  });

  test("its help says how to link, and lists Escape", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));
    const help = mounted.root.querySelector("dialog.help-dialog");

    expect(help?.textContent).toContain(
      "To link a variable, press it, then press the quantifier that binds it, or Free if none does.",
    );
    expect(
      [...(help?.querySelectorAll("kbd") ?? [])].map(
        (key) => key.textContent,
      ),
    ).toContain("Esc");
  });

  test("Escape lets the variable go, and focus goes back to it", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));
    const view = mounted.root.ownerDocument.defaultView;

    splitAll(mounted);
    variable(mounted, OUTER_X).click();
    mounted.root.activeElement?.dispatchEvent(
      new (view as Window & typeof globalThis).KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        key: "Escape",
      }),
    );

    expect(binders(mounted)).toEqual([]);
    expect(freeButton(mounted)?.hidden).toBe(true);
    expect(mounted.root.activeElement?.getAttribute("data-node")).toBe(
      OUTER_X,
    );
  });

  test("linking each variable to its quantifier finishes the tree", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));

    splitAll(mounted);
    mouseClick(variable(mounted, OUTER_X));
    mouseClick(shadowButton(mounted, 'button.st-bind[data-node=""]'));
    mouseClick(variable(mounted, INNER_X));
    mouseClick(shadowButton(mounted, 'button.st-bind[data-node="1.1"]'));

    expect(states(mounted)).toMatchObject({
      [OUTER_X]: "linked",
      [INNER_X]: "linked",
    });
    expect(
      mounted.root
        .querySelector(`.st-node[data-path="${INNER_X}"]`)
        ?.getAttribute("data-bound-by"),
    ).toBe("1.1");
    expect(markState(mounted)).toBe("ok");
    expect(message(mounted)).toBe("Every split and link is correct.");
    // One bus per quantifier, whatever it binds.
    expect(
      mounted.root.querySelectorAll("svg.st-lines path.st-link"),
    ).toHaveLength(2);
    expect(picks(mounted)).toContainEqual({
      linked: [1, 1],
      node: [1, 1, 1, 0, 0, 0],
    });
  });

  test("whole: linking to the wrong quantifier starts the tree over", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));

    splitAll(mounted);
    mouseClick(variable(mounted, INNER_X));
    mouseClick(shadowButton(mounted, 'button.st-bind[data-node=""]'));

    expect(states(mounted)).toEqual({ "": "open" });
    expect(message(mounted)).toBe(
      "That is not how this variable is bound. The tree starts over.",
    );
  });

  test("whole: linking to a quantifier that does not scope over the variable starts the tree over", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));

    splitAll(mounted);
    mouseClick(variable(mounted, OUTER_X));
    mouseClick(shadowButton(mounted, 'button.st-bind[data-node="1.1"]'));

    expect(states(mounted)).toEqual({ "": "open" });
    expect(message(mounted)).toBe(
      "That is not how this variable is bound. The tree starts over.",
    );
  });

  test("partial: Free for a bound variable stands, and the true link is drawn", async () => {
    const mounted = mountExercise(
      await syntaxTree(TERMS, `${TERM_ATTRS} scoring="partial"`),
    );

    splitAll(mounted);
    mouseClick(variable(mounted, OUTER_X));
    mouseClick(shadowButton(mounted, '[data-role="free"]'));

    expect(
      mounted.root
        .querySelector(`.st-node[data-path="${OUTER_X}"]`)
        ?.getAttribute("data-bound-by"),
    ).toBe("");
    expect(message(mounted)).toBe(
      "That is not how this variable is bound. Here is how it is.",
    );
    expect(picks(mounted)).toContainEqual({
      linked: null,
      node: [1, 0, 0, 0, 0],
    });
    expect(missed(mounted)).toEqual({ [OUTER_X]: "You picked Free." });
  });

  test("from the keyboard, a pressed variable hands focus to the first quantifier, and a link to the next variable", async () => {
    const mounted = mountExercise(await syntaxTree(TERMS, TERM_ATTRS));

    splitAll(mounted);
    variable(mounted, OUTER_X).click();
    expect(mounted.root.activeElement?.getAttribute("data-node")).toBe("");

    (mounted.root.activeElement as HTMLElement | null)?.click();
    expect(mounted.root.activeElement?.getAttribute("data-node")).toBe(
      INNER_X,
    );
  });
});
