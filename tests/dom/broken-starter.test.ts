import { describe, expect, test } from "bun:test";
import { forEachDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  compileExercise,
  type MountedExercise,
  markState,
  mountExercise,
  until,
} from "./mount-exercise";
import { mockProofCompiler } from "./proof-compiler-mock";

/**
 * A starter handed over broken on purpose (gh #44): a `?` where a step is
 * missing, a formula to repair. The save only warns, so each editor has to
 * open on what the author wrote — the line as typed, flagged as the
 * student's own typing would be, and nothing sent to the compiler until it
 * reads. That the save warns is the authoring suites'.
 */

const compile = await mockProofCompiler();

await import("../../src/client/components/carnap-aufbau-proof-fitch-v1");
await import("../../src/client/components/carnap-aufbau-proof-tree-v1");
await import("../../src/client/components/carnap-aufbau-proof-prawitz-v1");

const FORALLX = `:::aufbau-mm0{name="forallx" src="/theories/forallx-calgary.mm0"}\n:::`;
const GOAL = "theorem g: $ P → Q ; P ⊢ Q $";

function exercise(kind: string, starter: string) {
  return compileExercise(
    `${FORALLX}\n\n:::aufbau-proof-${kind}{system="forallx" id="x"}\nRepair it.\n\n${GOAL}\n----\n${starter}\n:::`,
  );
}

/**
 * Mounts, waits for the first check to settle on `ready`, and says whether
 * the compiler was asked anything along the way.
 */
async function mount(
  kind: string,
  starter: string,
  ready: (mounted: MountedExercise) => boolean,
) {
  const fixture = await exercise(kind, starter);
  const calls = compile.mock.calls.length;
  const mounted = mountExercise(fixture);
  await until(() => ready(mounted));
  return { compiled: compile.mock.calls.length > calls, mounted };
}

/** The lines of a Fitch editor that carry an underline, each once. */
function underlinedLines(mounted: MountedExercise): string[] {
  const view = editorOf(mounted);
  const lines = new Set<string>();
  forEachDiagnostic(view.state, (_diagnostic, from) => {
    lines.add(view.state.doc.lineAt(from).text);
  });
  return [...lines];
}

function editorOf(mounted: MountedExercise): EditorView {
  return EditorView.findFromDOM(
    mounted.root.querySelector(".cm-editor") as HTMLElement,
  ) as EditorView;
}

/** The formula fields a tree editor marks invalid, by their text. */
function invalidFields(mounted: MountedExercise): string[] {
  return Array.from(
    mounted.root.querySelectorAll<HTMLElement>('[aria-invalid="true"]'),
  ).map((field) => field.textContent?.trim() ?? "");
}

describe("an editor opened on a starter that does not read", () => {
  test("Fitch keeps the text as written and underlines the broken lines", async () => {
    const starter = [
      "P → Q   :PR",
      "P       :PR",
      "?",
      "Q ∧     :→E 1 2",
    ].join("\n");
    const { compiled, mounted } = await mount(
      "fitch",
      starter,
      (m) => underlinedLines(m).length > 0,
    );

    expect(mounted.element.dataset.enhanced).toBe("true");
    expect(editorOf(mounted).state.doc.toString()).toBe(starter);
    expect(underlinedLines(mounted)).toEqual(["?", "Q ∧     :→E 1 2"]);
    expect(markState(mounted)).toBe("idle");
    expect(compiled).toBe(false);
  });

  test("the proof tree opens on the tree, with the broken node marked", async () => {
    const { compiled, mounted } = await mount(
      "tree",
      [
        "l1: $ P → Q ; P ⊢ ? $ by AS []",
        "l2: $ P → Q ; P ⊢ P $ by AS []",
        "l3: $ P → Q ; P ⊢ Q $ by imp_elim [l1, l2]",
      ].join("\n"),
      (m) => invalidFields(m).length > 0,
    );

    expect(mounted.element.dataset.enhanced).toBe("true");
    expect(invalidFields(mounted)).toEqual(["P → Q ; P ⊢ ?"]);
    expect(markState(mounted)).toBe("idle");
    expect(compiled).toBe(false);
  });

  test("Prawitz opens on the tree, with the broken assumption marked", async () => {
    const { compiled, mounted } = await mount(
      "prawitz",
      [
        "a1: $ P → Q ⊢ ? $ by AS []",
        "a2: $ P ⊢ P $ by AS []",
        "l1: $ _ ⊢ Q $ by imp_elim [a1, a2]",
      ].join("\n"),
      (m) => invalidFields(m).length > 0,
    );

    expect(mounted.element.dataset.enhanced).toBe("true");
    expect(invalidFields(mounted)).toEqual(["?"]);
    expect(markState(mounted)).toBe("idle");
    expect(compiled).toBe(false);
  });
});

/** The Fitch editor's underline messages, in order. */
function underlineMessages(mounted: MountedExercise): string[] {
  const messages: string[] = [];
  forEachDiagnostic(editorOf(mounted).state, (diagnostic) => {
    messages.push(diagnostic.message);
  });
  return messages;
}

/** Whether some element of the widget says exactly `text`. */
function says(mounted: MountedExercise, text: string): boolean {
  return Array.from(mounted.root.querySelectorAll("*")).some(
    (element) => element.textContent === text,
  );
}

// gh #53: a citation of a rule the theory does not have is the widget's to
// name, and nothing reaches the compiler while one stands.
describe("an editor opened on a starter citing a rule the theory lacks", () => {
  test("Fitch underlines the name and says there is no such rule", async () => {
    const starter = [
      "P → Q   :PR",
      "P       :PR",
      "Q       :\\/Elim 1 2",
    ].join("\n");
    const { compiled, mounted } = await mount(
      "fitch",
      starter,
      (m) => underlinedLines(m).length > 0,
    );

    expect(underlinedLines(mounted)).toEqual(["Q       :\\/Elim 1 2"]);
    expect(underlineMessages(mounted)).toEqual([
      "There is no rule called “\\/Elim”.",
    ]);
    expect(markState(mounted)).toBe("idle");
    expect(compiled).toBe(false);
  });

  test("the proof tree marks the node and says there is no such rule", async () => {
    const { compiled, mounted } = await mount(
      "tree",
      [
        "l1: $ P → Q ; P ⊢ P → Q $ by AS []",
        "l2: $ P → Q ; P ⊢ P $ by AS []",
        "l3: $ P → Q ; P ⊢ Q $ by impElim [l1, l2]",
      ].join("\n"),
      (m) => says(m, "There is no rule called “impElim”."),
    );

    // The root carries the goal, so the problem is its line's, not a field's.
    expect(invalidFields(mounted)).toEqual([]);
    expect(markState(mounted)).toBe("idle");
    expect(compiled).toBe(false);
  });

  test("Prawitz marks the node and says there is no such rule", async () => {
    const { compiled, mounted } = await mount(
      "prawitz",
      [
        "a1: $ P → Q ⊢ P → Q $ by AS []",
        "a2: $ P ⊢ P $ by AS []",
        "l1: $ _ ⊢ Q $ by ->Elim [a1, a2]",
      ].join("\n"),
      (m) => invalidFields(m).length > 0,
    );

    expect(invalidFields(mounted)).toEqual(["Q"]);
    expect(says(mounted, "There is no rule called “->Elim”.")).toBe(true);
    expect(markState(mounted)).toBe("idle");
    expect(compiled).toBe(false);
  });
});
