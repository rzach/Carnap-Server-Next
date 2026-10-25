import { describe, expect, test } from "bun:test";
import {
  parseTreeStarter,
  rootRowId,
  type TruthTreeStarter,
  treeStarterSource,
} from "../src/worker/exercises/truth-tree/starter";
import type { TableauDocument } from "../src/worker/exercises/truth-tree/tableau/document";

const ROOT = ["(D & ¬R) ∨ Q", "¬Q ∨ R", "¬(D ∨ R)"];

const WORKED = `4: $ ¬D $ by ¬∨ [3]
5: $ ¬R $
- 6: $ D & ¬R $ by ∨ [1]
  7: $ D $ by & [6]
  8: $ ¬R $
  closed [4, 7]
- 6: $ Q $
  - 7: $ ¬Q $ by ∨ [2]
    closed [6, 7]
  - 7: $ R $
    closed [5, 7]`;

function parsed(text: string, rootRows = ROOT.length): TruthTreeStarter {
  const result = parseTreeStarter(text, rootRows);

  if (!result.ok) {
    throw new Error(`${result.issue.code}: ${result.issue.message}`);
  }

  return result.starter;
}

function issueOf(text: string, rootRows = ROOT.length): string {
  const result = parseTreeStarter(text, rootRows);

  if (result.ok) {
    throw new Error("expected the starter to be refused");
  }

  return result.issue.code;
}

/** The whole tree a starter seeds, its root in front, as the exercise adds it. */
function seeded(starter: TruthTreeStarter, root = ROOT): TableauDocument {
  const [first, ...rest] = starter.nodes;

  return {
    nodes: [
      {
        ...(first as TableauDocument["nodes"][number]),
        rows: [
          ...root.map((text, at) => ({
            cites: [],
            dev: "root",
            id: rootRowId(at + 1),
            text,
          })),
          ...(first?.rows ?? []),
        ],
      },
      ...rest,
    ],
  };
}

describe("a truth-tree starter", () => {
  test("reads steps, splits and ends, citing by label along each branch", () => {
    const starter = parsed(WORKED);
    const [root, left, right, rightLeft, rightRight] = starter.nodes;

    expect(starter.nodes.map((node) => [node.id, node.parent])).toEqual([
      ["root", null],
      ["n1", "root"],
      ["n2", "root"],
      ["n3", "n2"],
      ["n4", "n2"],
    ]);
    // ¬D and ¬R are one step from row 3.
    expect(root?.rows.map((row) => [row.text, row.cites, row.dev])).toEqual([
      ["¬D", [rootRowId(3)], "d1"],
      ["¬R", [rootRowId(3)], "d1"],
    ]);
    // The split's step is named on its first branch; the second continues it.
    expect(left?.rows[0]?.dev).toBe("d2");
    expect(right?.rows[0]).toEqual({
      cites: [rootRowId(1)],
      dev: "d2",
      id: "s6",
      text: "Q",
    });
    expect(starter.rules).toEqual({ d1: "¬∨", d2: "∨", d3: "&", d4: "∨" });
    // Each branch's 6 and 7 is its own.
    expect(left?.end).toEqual({ cites: ["s1", "s4"], type: "closed" });
    expect(rightLeft?.end).toEqual({ cites: ["s6", "s7"], type: "closed" });
    expect(rightRight?.end).toEqual({ cites: ["s2", "s8"], type: "closed" });
  });

  test("writes a tree back as a root list and a starter that reads as the same tree", () => {
    const starter = parsed(WORKED);
    const rules = new Map(Object.entries(starter.rules));
    const source = treeStarterSource(seeded(starter), rules, ROOT.length);
    const [list, below] = source.split("\n----\n");

    expect(list).toBe(ROOT.map((text) => `- ${text}`).join("\n"));
    expect(parsed(below ?? "")).toEqual(starter);
    // Each row is labelled with its line as the editor numbers it: the right
    // branch's split sits below the left branch's last row.
    expect(below).toContain("  - 9: $ ¬Q $ by ∨ [2]\n    closed [6, 9]");
  });

  test("writes a tree with nothing below its root as the root list alone", () => {
    expect(
      treeStarterSource(seeded(parsed("")), new Map(), ROOT.length),
    ).toBe(ROOT.map((text) => `- ${text}`).join("\n"));
  });

  test("writes a step not yet justified, and an open branch, so they read back", () => {
    const text = "4: $ D $ by []\nopen";
    const starter = parsed(text);

    expect(starter.nodes[0]?.rows[0]?.cites).toEqual([]);
    expect(starter.rules).toEqual({});
    expect(starter.nodes[0]?.end).toEqual({ type: "open" });
    expect(
      treeStarterSource(seeded(starter), new Map(), ROOT.length).split(
        "----\n",
      )[1],
    ).toBe(text);
  });

  test("takes labels as optional, comments and blank lines as nothing", () => {
    const starter = parsed("-- the first step\n\n$ ¬D $ by ¬∨ [3]\n$ ¬R $");

    expect(starter.nodes[0]?.rows.map((row) => row.dev)).toEqual([
      "d1",
      "d1",
    ]);
  });

  test("refuses what cannot be put in a tree", () => {
    // A row after the root continues no step.
    expect(issueOf("4: $ ¬D $")).toBe("truth_tree_starter_unjustified");
    // A split's first branch must name its step, and only that one.
    expect(issueOf("- $ D $\n- $ Q $")).toBe(
      "truth_tree_starter_unjustified",
    );
    expect(issueOf("- $ D $ by ∨ [1]\n- $ Q $ by ∨ [1]")).toBe(
      "truth_tree_starter_split_step",
    );
    // A label names a row above it on its own branch.
    expect(issueOf("4: $ D $ by ∨ [9]")).toBe("truth_tree_starter_citation");
    expect(issueOf("- 6: $ D $ by ∨ [1]\n- 6: $ Q $\n  closed [6, 7]")).toBe(
      "truth_tree_starter_citation",
    );
    expect(issueOf("4: $ D $ by ∨ [1]\n4: $ Q $")).toBe(
      "truth_tree_starter_label",
    );
    expect(issueOf("2: $ D $ by ∨ [1]")).toBe("truth_tree_starter_label");
    // Nothing after an end or a split, and nothing out of line.
    expect(issueOf("closed\n4: $ D $ by ∨ [1]")).toBe(
      "truth_tree_starter_after_end",
    );
    expect(issueOf("- $ D $ by ∨ [1]\n- $ Q $\n$ R $ by ∨ [2]")).toBe(
      "truth_tree_starter_after_split",
    );
    expect(issueOf("$ D $ by ∨ [1]\n    $ Q $")).toBe(
      "truth_tree_starter_indent",
    );
    expect(issueOf("- closed")).toBe("truth_tree_starter_empty_branch");
    expect(issueOf("D by ∨ [1]")).toBe("truth_tree_starter_line");
    // And there is no starter without a root to grow from.
    expect(issueOf("$ D $ by [1]", 0)).toBe(
      "truth_tree_starter_without_root",
    );
  });
});
