import { describe, expect, test } from "bun:test";

import {
  ENGINE_TEXT,
  proofRuleReader,
} from "../src/worker/exercise-kit/proof/formulas";
import type { ProofTreeNode } from "../src/worker/exercise-kit/proof/tree-parse";
import { fitchToAuf } from "../src/worker/exercises/aufbau-proof-fitch/translate";
import { prawitzToAuf } from "../src/worker/exercises/aufbau-proof-prawitz/translate";
import type { PrawitzProofNode } from "../src/worker/exercises/aufbau-proof-prawitz/types";
import { flattenProofTree } from "../src/worker/exercises/aufbau-proof-tree/flatten";
import { FORALLX_THEORY_SOURCE } from "./helpers/forallx-theory";

/**
 * A citation the theory has no rule by (gh #53) is the translator's to report,
 * by the name the student wrote, and never the engine's: sent on, `\/Intro`
 * (no MM0 identifier) came back "expected identifier" and `orIntro` came back
 * "unknown rule", neither naming the rule. Both are refused the same way here,
 * by membership in the theory's rules and aliases, never by their spelling. An
 * alias, a rule's own name, and the engine's `sorry!` are all known.
 */

const readRule = proofRuleReader(FORALLX_THEORY_SOURCE);

describe("a Fitch line citing a rule the theory lacks", () => {
  const translate = (lines: readonly string[]) =>
    fitchToAuf(
      lines.join("\n"),
      "g",
      "AS",
      "⊢",
      ";",
      ENGINE_TEXT,
      undefined,
      readRule,
    );

  test("is named on its line, under the name, whatever the name starts with", () => {
    const lines = ["P :PR", "P ∨ Q :\\/Intro 1", "  Q ∨ P   :orIntro 1"];
    const { diagnostics, ruleProblems } = translate(lines);

    expect(diagnostics).toEqual([]);
    expect(
      ruleProblems.map(({ rule, sourceLine }) => [sourceLine, rule]),
    ).toEqual([
      [1, "\\/Intro"],
      [2, "orIntro"],
    ]);
    for (const problem of ruleProblems) {
      expect(
        lines[problem.sourceLine]
          ?.slice(problem.column)
          .startsWith(problem.rule),
      ).toBe(true);
    }
  });

  test("an alias, a rule's own name and sorry! are known", () => {
    const { proofText, ruleProblems } = translate([
      "P :PR",
      "P ∨ Q :\\/I 1",
      "P ∨ Q :or_intro_l 1",
      "Q :sorry!",
    ]);

    expect(ruleProblems).toEqual([]);
    expect(proofText).toContain("by sorry!");
  });
});

describe("a Prawitz node citing a rule the theory lacks", () => {
  const tree = (rule: string): PrawitzProofNode => ({
    formula: "P ∨ Q",
    id: "root",
    premises: [{ formula: "P", id: "leaf", premises: [], rule: "PR" }],
    rule,
  });
  const translate = (rule: string) =>
    prawitzToAuf(tree(rule), "g", "AS", "⊢", ";", ENGINE_TEXT, readRule);

  test("is named on its node, whatever the name starts with", () => {
    expect(translate("\\/Intro").ruleProblems).toEqual([
      { nodeId: "root", rule: "\\/Intro" },
    ]);
    expect(translate("orIntro").ruleProblems).toEqual([
      { nodeId: "root", rule: "orIntro" },
    ]);
  });

  test("an alias is known, and an assumption cited by alias is still a leaf", () => {
    const translated = translate("∨I");

    expect(translated.ruleProblems).toEqual([]);
    expect(translated.diagnostics).toEqual([]);
    expect(translated.proofText).toContain("by AS []");
  });
});

describe("a proof-tree node citing a rule the theory lacks", () => {
  const tree = (rule: string): ProofTreeNode => ({
    formula: "P ⊢ P ∨ Q",
    id: "root",
    premises: [{ formula: "P ⊢ P", id: "leaf", premises: [], rule: "AS" }],
    rule,
  });
  const flatten = (rule: string) =>
    flattenProofTree(tree(rule), "g", ENGINE_TEXT, readRule);

  test("is named on its node, whatever the name starts with", () => {
    expect(flatten("\\/Intro").ruleProblems).toEqual([
      { nodeId: "root", rule: "\\/Intro" },
    ]);
    expect(flatten("orIntro").ruleProblems).toEqual([
      { nodeId: "root", rule: "orIntro" },
    ]);
  });

  test("an alias is known, and an unfinished node is not this complaint", () => {
    expect(flatten("∨I").ruleProblems).toEqual([]);
    expect(flatten("").ruleProblems).toEqual([]);
  });
});
