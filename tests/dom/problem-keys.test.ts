import { describe, expect, test } from "bun:test";
import { diagnosticCount } from "@codemirror/lint";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { dom } from "../helpers/dom";
import {
  compileExercise,
  type MountedExercise,
  mountExercise,
  typeInto,
  until,
} from "./mount-exercise";
import {
  PRAWITZ_THEORY,
  prawitzButton,
  prawitzExercise,
  prawitzFormulaFieldOf,
  prawitzItems,
} from "./prawitz-widget";
import { compilesFine, mockProofCompiler } from "./proof-compiler-mock";
import { toolbarButton, treeExercise } from "./tree-widget";

/**
 * A line's problem has to be reachable by someone who cannot see its squiggle
 * or hover it. In all four proof widgets F8 and Shift-F8 step between the
 * problems and say each one: the tree and Prawitz editors move focus to the
 * line, whose treeitem is described by a note holding its problem; the
 * linear and Fitch editors select the problem's text and announce its
 * message. Where there is none to step to, they say so — unless feedback
 * withholds the problems, where that would be a verdict, and the keys are not
 * there at all.
 *
 * The compiler is mocked at the module seam, failing any proof that cites a
 * rule named `nope`, on that word, as the real engine fails a rule it does
 * not have.
 */

const MESSAGE = "unknown rule nope";

await mockProofCompiler((mm0: string, proof: string) => {
  const at = proof.indexOf("nope");
  if (at === -1) {
    return compilesFine(mm0, proof);
  }
  const spanStart = Buffer.byteLength(proof.slice(0, at));
  return {
    diagnostics: [
      {
        error: "UnknownRule",
        message: MESSAGE,
        severity: "error",
        spanEnd: spanStart + "nope".length,
        spanStart,
      },
    ],
    ok: false,
  };
});

await import("../../src/client/components/carnap-aufbau-proof-tree-v1");
await import("../../src/client/components/carnap-aufbau-proof-prawitz-v1");
await import("../../src/client/components/carnap-aufbau-proof-v1");

const MINI = [
  ':::aufbau-mm0{name="mini"}',
  "provable sort wff;",
  "term imp (a b: wff): wff; infixr imp: $->$ prec 25;",
  "axiom mp (a b: wff): $ a $ > $ a -> b $ > $ b $;",
  ":::",
].join("\n");

/** Press a key where the reader's focus is, as the keyboard would. */
function press(mounted: MountedExercise, key: string, shiftKey = false) {
  const event = new dom.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey,
  });
  (
    mounted.root.activeElement ?? mounted.root.firstElementChild
  )?.dispatchEvent(event);
  return event;
}

/** What the widget's own live region last said. */
function spoken(mounted: MountedExercise): string | undefined {
  return mounted.root.querySelector("[aria-live]")?.textContent?.trim();
}

/** The keys the widget's help dialog lists, behind a (?) in its action bar. */
function helpKeys(mounted: MountedExercise): string[] {
  expect(
    mounted.form
      .querySelector(".exercise-actions .help-trigger")
      ?.getAttribute("aria-label"),
  ).toBe("Usage and keyboard shortcuts");
  return Array.from(
    mounted.root.querySelectorAll("dialog.help-dialog kbd"),
    (key) => key.textContent ?? "",
  );
}

/** The hidden note an element is described by. */
function noteOf(mounted: MountedExercise, element: Element): string | null {
  const id = element.getAttribute("aria-describedby");
  return id === null
    ? null
    : (mounted.root.getElementById(id)?.textContent ?? null);
}

/** A line's own child of the given ProofML tag (jsdom will not resolve
 *  `:scope >` through a custom element). */
function partOf(item: HTMLElement, tag: string): Element {
  const part = Array.from(item.closest("proof-tree")?.children ?? []).find(
    (child) => child.tagName === tag,
  );
  if (part === undefined) {
    throw new Error(`no ${tag}`);
  }
  return part;
}

describe("the tree editor", () => {
  const TREE = `:::aufbau-proof-tree{system="mini" id="t1"}\nProve it.\n\ntheorem goal (p: wff): $ p $\n:::`;

  /** A goal with one premise above it, whose rule is `rule`. */
  async function withPremise(
    rule: string,
    feedback: "full" | "terse" = "full",
  ) {
    const mounted = mountExercise(await treeExercise(TREE, MINI), {
      options: { feedback },
    });
    toolbarButton(mounted, "Add premise").click();
    const [premise, root] = Array.from(
      mounted.root.querySelectorAll<HTMLElement>('[role="treeitem"]'),
    ) as [HTMLElement, HTMLElement];
    const ruleField = partOf(premise, "PROOF-INFERENCE").querySelector(
      ".tree-rule",
    ) as HTMLElement;
    typeInto(ruleField, rule);
    return { mounted, premise, root, ruleField };
  }

  test("a line's problem is its treeitem's description, and its field says it is invalid", async () => {
    const { mounted, premise, root, ruleField } = await withPremise("nope");
    await until(() => premise.hasAttribute("aria-describedby"));

    expect(noteOf(mounted, premise)).toBe(MESSAGE);
    expect(root.hasAttribute("aria-describedby")).toBe(false);
    // The note sits beside the treeitem, not inside it, where it would be
    // read a second time as part of the line's name.
    expect(premise.textContent).not.toContain(MESSAGE);

    const formula = premise.querySelector(".tree-edit") as HTMLElement;
    expect(formula.getAttribute("role")).toBe("textbox");
    expect(formula.getAttribute("aria-label")).toBe("Formula");
    expect(formula.getAttribute("aria-invalid")).toBe("true");
    expect(noteOf(mounted, formula)).toBe(MESSAGE);
    // The problem is the line's, not a warning on its rule.
    expect(ruleField.getAttribute("aria-label")).toBe("Rule");
    expect(ruleField.hasAttribute("aria-describedby")).toBe(false);
  });

  test("F8 goes to the line, says it again where there is nowhere else, and says when there is none", async () => {
    const { mounted, premise, root, ruleField } = await withPremise("nope");
    await until(() => premise.hasAttribute("aria-describedby"));

    root.focus();
    expect(press(mounted, "F8").defaultPrevented).toBe(true);
    expect(mounted.root.activeElement).toBe(premise);

    // Standing on the only problem, focus cannot move to say it.
    press(mounted, "F8");
    expect(mounted.root.activeElement).toBe(premise);
    expect(spoken(mounted)).toBe(MESSAGE);

    // From inside the line's own field, the way back is to the line.
    (premise.querySelector(".tree-edit") as HTMLElement).focus();
    press(mounted, "F8", true);
    expect(mounted.root.activeElement).toBe(premise);

    typeInto(ruleField, "mp");
    await until(() => !premise.hasAttribute("aria-describedby"));
    press(mounted, "F8");
    expect(spoken(mounted)).toBe("No problems.");
  });

  test("terse feedback has no problems to step to, and no F8", async () => {
    const { mounted, premise, root } = await withPremise("nope", "terse");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(premise.hasAttribute("aria-describedby")).toBe(false);
    root.focus();
    expect(press(mounted, "F8").defaultPrevented).toBe(false);
    expect(mounted.root.querySelector("[aria-live]")).toBeNull();
  });
});

describe("the Prawitz editor", () => {
  // A language, so `top →` is refused before any compile.
  const READING = PRAWITZ_THEORY.replace(
    "provable sort wff;",
    "--| @syntax delimiter $ top → ( ) $\n--| @syntax role sentence\nprovable sort wff;",
  );

  test("F8 and Shift-F8 walk the lines with problems, wrapping at the ends", async () => {
    const mounted = mountExercise(await prawitzExercise("", READING), {
      options: { feedback: "full" },
    });
    // One derivation — a split workspace says nothing about its lines — of
    // two lines, both of which the language refuses.
    prawitzButton(mounted, "New assumption").click();
    typeInto(
      prawitzFormulaFieldOf(prawitzItems(mounted)[0] as HTMLElement),
      "top →",
    );
    prawitzButton(mounted, "Apply rule below").click();
    const [first, second] = prawitzItems(mounted) as [
      HTMLElement,
      HTMLElement,
    ];
    typeInto(prawitzFormulaFieldOf(second), "top →");
    await until(() => second.hasAttribute("aria-describedby"));

    expect(noteOf(mounted, first)).toBe("Expected a formula.");
    expect(prawitzFormulaFieldOf(first).getAttribute("aria-invalid")).toBe(
      "true",
    );

    first.focus();
    press(mounted, "F8");
    expect(mounted.root.activeElement).toBe(second);
    press(mounted, "F8");
    expect(mounted.root.activeElement).toBe(first);
    press(mounted, "F8", true);
    expect(mounted.root.activeElement).toBe(second);
  });
});

describe("the linear editor", () => {
  function linear(body: string, attributes = ""): string {
    return `${MINI}\n\n:::aufbau-proof{system="mini" id="p1"${attributes}}\ntheorem goal (p: wff): $ p $ > $ p $\n----\n${body}\n:::`;
  }

  function editorOf(mounted: MountedExercise): EditorView {
    const view = EditorView.findFromDOM(
      mounted.root.querySelector(".cm-editor") as HTMLElement,
    );
    if (view === null) {
      throw new Error("no editor");
    }
    return view;
  }

  /** A key handled by the editor's own keymaps, as a keystroke in it is. */
  function key(view: EditorView, name: string, shiftKey = false): boolean {
    return runScopeHandlers(
      view,
      new dom.window.KeyboardEvent("keydown", { key: name, shiftKey }),
      "editor",
    );
  }

  function announced(mounted: MountedExercise): string {
    return mounted.root.querySelector(".cm-announced")?.textContent ?? "";
  }

  test("its help lists the problem keys, and F8 selects a problem and says it", async () => {
    const body = "l1: $ p $ by nope [#1]";
    const mounted = mountExercise(await compileExercise(linear(body)));
    expect(helpKeys(mounted)).toEqual([
      "Ctrl-Z",
      "Ctrl-Y",
      "F8",
      "Shift-F8",
      "Ctrl-Shift-M",
    ]);

    const view = editorOf(mounted);
    await until(() => diagnosticCount(view.state) > 0);
    expect(key(view, "F8")).toBe(true);
    expect(announced(mounted)).toBe(MESSAGE);

    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("nope");

    // The only problem, already selected: said again rather than skipped.
    expect(key(view, "F8", true)).toBe(true);
    expect(announced(mounted)).toBe(MESSAGE);

    view.dispatch({ changes: { from, insert: "mp", to } });
    await until(() => diagnosticCount(view.state) === 0);
    key(view, "F8");
    expect(announced(mounted)).toBe("No problems.");
  });

  test("terse feedback has the help, but neither the problem keys nor their rows", async () => {
    const mounted = mountExercise(
      await compileExercise(linear("l1: $ p $ by nope [#1]")),
      { options: { feedback: "terse" } },
    );

    expect(helpKeys(mounted)).toEqual(["Ctrl-Z", "Ctrl-Y"]);
    expect(key(editorOf(mounted), "F8")).toBe(false);
  });
});
