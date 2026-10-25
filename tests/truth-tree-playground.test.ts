import { describe, expect, test } from "bun:test";
import { compileCarnapMarkdown } from "../src/worker/application/content/compiler";
import {
  rootRowsOf,
  startingRules,
  startingTree,
  treeRoot,
} from "../src/worker/exercises/truth-tree/grading";
import { treeStarterSource } from "../src/worker/exercises/truth-tree/starter";
import type { TableauDocument } from "../src/worker/exercises/truth-tree/tableau/document";
import {
  certifyAnswer,
  gradeAnswer,
  judgeAsServer,
  lessonTree,
  problems,
} from "./helpers/truth-tree";

/**
 * A truth tree's starter, the tree the student begins from below the root,
 * and its playground, where the student writes the root (#475).
 */

function directive(attrs: string, body: string): string {
  return `::::truth-tree{${attrs}}\n${body}\n::::`;
}

async function diagnostics(
  source: string,
): Promise<{ code: string; line: number; severity: string }[]> {
  const result = await compileCarnapMarkdown(source);
  return result.diagnostics.map(({ code, line, severity }) => ({
    code,
    line,
    severity,
  }));
}

const ROOT = "- P & Q\n- ¬P";
const CLOSED = "3: $ P $ by & [1]\n4: $ Q $\nclosed [2, 3]";

/** The tree an exercise starts from, as the editor would submit it. */
function started(exercise: Awaited<ReturnType<typeof lessonTree>>) {
  return {
    nodes: startingTree(exercise.resolved).nodes,
    rules: Object.fromEntries(startingRules(exercise.resolved)),
  };
}

describe("a starter", () => {
  test("seeds the tree below the root, and a done one grades as the student's", async () => {
    const exercise = await lessonTree(
      directive('#t points="2"', `Valid?\n\n${ROOT}\n----\n${CLOSED}`),
    );
    const tree = startingTree(exercise.resolved);

    expect(tree.nodes[0]?.rows.map((row) => row.text)).toEqual([
      "P & Q",
      "¬P",
      "P",
      "Q",
    ]);
    expect(tree.nodes[0]?.end).toEqual({
      cites: ["root-2", "s1"],
      type: "closed",
    });
    expect(
      await gradeAnswer(
        exercise.item,
        await certifyAnswer(exercise.publicData, started(exercise)),
      ),
    ).toBe("correct");
  });

  test("is copied back as the directive's body", async () => {
    const exercise = await lessonTree(
      directive("#t", `Valid?\n\n${ROOT}\n----\n${CLOSED}`),
    );
    const tree = startingTree(exercise.resolved);

    expect(
      treeStarterSource(
        tree,
        startingRules(exercise.resolved),
        rootRowsOf(exercise.resolved, tree),
      ),
    ).toBe(`${ROOT}\n----\n${CLOSED}`);
  });

  test("refuses a shape it cannot hold, on its line, and warns of rows and rules", async () => {
    // Body lines: 1 the prompt, 2 blank, 3–4 the root, 5 the underline.
    expect(
      await diagnostics(
        directive("#t", `Valid?\n\n${ROOT}\n----\n3: $ P $ by & [9]`),
      ),
    ).toEqual([
      { code: "truth_tree_starter_citation", line: 7, severity: "error" },
    ]);
    expect(
      await diagnostics(
        directive("#t", `Valid?\n\n${ROOT}\n----\n3: $ P & $ by && [1]`),
      ),
    ).toEqual([
      { code: "invalid_formula", line: 7, severity: "warning" },
      { code: "unknown_rule", line: 7, severity: "warning" },
    ]);
  });

  test("a rule above the root is the prompt's, not an underline", async () => {
    const exercise = await lessonTree(
      directive("#t", `Valid?\n\n----\n\nAnd so on.\n\n${ROOT}`),
    );

    expect(exercise.resolved.rootText).toEqual(["P & Q", "¬P"]);
    expect(exercise.publicData.starter).toBeUndefined();
  });
});

describe("a playground", () => {
  test("needs no root, and begins with one empty row", async () => {
    const exercise = await lessonTree(
      directive('#t playground points="0"', "Try anything."),
    );

    expect(exercise.publicData.playground).toBe(true);
    expect(exercise.publicData.root).toEqual([]);
    expect(startingTree(exercise.resolved).nodes).toEqual([
      {
        id: "root",
        parent: null,
        rows: [{ cites: [], dev: "root", id: "root-1", text: "" }],
      },
    ]);
  });

  test("is judged from the root the student writes: the tree's first step", async () => {
    const exercise = await lessonTree(
      directive('#t playground points="0"', "Try anything."),
    );
    const tree: TableauDocument = {
      nodes: [
        {
          end: { cites: ["r2", "t1"], type: "closed" },
          id: "n0",
          parent: null,
          rows: [
            { cites: [], dev: "root", id: "r1", text: "A & B" },
            { cites: [], dev: "root", id: "r2", text: "¬A" },
            { cites: ["r1"], dev: "d1", id: "t1", text: "A" },
            { cites: ["r1"], dev: "d1", id: "t2", text: "B" },
          ],
        },
      ],
    };

    expect(rootRowsOf(exercise.resolved, tree)).toBe(2);
    expect(treeRoot(exercise.resolved, tree)).toEqual(
      ["A & B", "¬A"].map((text) => {
        const read = exercise.resolved.reader.read(text);
        return read.ok ? read.engine : text;
      }),
    );

    const answer = await certifyAnswer(exercise.publicData, {
      nodes: tree.nodes,
      rules: { d1: "&" },
    });

    expect(await gradeAnswer(exercise.item, answer)).toBe("correct");
  });

  test("an uncited row stacked below the root is a step, not more of the root", async () => {
    const exercise = await lessonTree(
      directive("#t playground", "Try anything."),
    );
    const tree: TableauDocument = {
      nodes: [
        {
          id: "n0",
          parent: null,
          rows: [
            { cites: [], dev: "root", id: "r1", text: "A" },
            { cites: [], dev: "d1", id: "t1", text: "¬A" },
          ],
        },
      ],
    };

    expect(rootRowsOf(exercise.resolved, tree)).toBe(1);
    expect(
      problems(await judgeAsServer(exercise, { nodes: tree.nodes })),
    ).toContain("row t1: uncited");
  });

  test("a root the student does not write is said so", async () => {
    const exercise = await lessonTree(
      directive("#t playground", "Try anything."),
    );
    const none = await judgeAsServer(exercise, {
      nodes: [
        {
          id: "n0",
          parent: null,
          rows: [{ cites: ["r1"], dev: "d1", id: "r1", text: "A" }],
        },
      ],
    });

    expect(problems(none)).toContain("tree: root-empty");

    // As it begins, with one blank row: said of the tree, not the row.
    expect(
      problems(
        await judgeAsServer(exercise, {
          nodes: startingTree(exercise.resolved).nodes,
        }),
      ),
    ).toEqual(["tree: root-empty"]);
  });

  test("a root list and starter in a playground are where it begins", async () => {
    const exercise = await lessonTree(
      directive("#t playground", `Try anything.\n\n${ROOT}\n----\n${CLOSED}`),
    );
    const tree = startingTree(exercise.resolved);

    expect(rootRowsOf(exercise.resolved, tree)).toBe(2);
    expect(
      await gradeAnswer(
        exercise.item,
        await certifyAnswer(exercise.publicData, started(exercise)),
      ),
    ).toBe("correct");
  });
});
