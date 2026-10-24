import { describe, expect, test } from "bun:test";
import type { SurfaceLanguage } from "@aufbau/syntax";
import { printTerm } from "@aufbau/syntax";

import type {
  SentenceSegment,
  SyntaxTree,
} from "../src/worker/exercises/syntax-tree/logic/tree";
import {
  isRightPick,
  pickableCount,
  readSentence,
  sentenceSortOf,
  syntaxTree,
  typedPick,
} from "../src/worker/exercises/syntax-tree/logic/tree";
import { languageById } from "../src/worker/logic/specs";

/**
 * The tree is the parse's, in any language: no connective is named here that
 * the language does not declare, and a quantifier or a modal box splits the
 * way a conjunction does.
 */

function language(id: string): SurfaceLanguage {
  const lang = languageById(id);

  if (lang === null) {
    throw new Error(`no language ${id}`);
  }

  return lang;
}

function treeOf(id: string, text: string): SyntaxTree {
  const lang = language(id);
  const sort = sentenceSortOf(lang);
  const parsed = lang.parse(text, sort === null ? {} : { sort });

  if (!parsed.ok) {
    throw new Error(`${text}: ${parsed.diagnostics[0]?.message}`);
  }

  return syntaxTree(lang, parsed.term);
}

/** Each node as its text, then its children's, indented. */
function outline(tree: SyntaxTree): string[] {
  const lines: string[] = [];
  const visit = (index: number, depth: number) => {
    const node = tree.nodes[index];

    if (node === undefined) {
      return;
    }

    lines.push(`${"  ".repeat(depth)}${node.text}${node.atom ? " ·" : ""}`);
    for (const child of node.children) {
      visit(child, depth + 1);
    }
  };

  visit(0, 0);

  return lines;
}

const show = (segments: readonly SentenceSegment[]) =>
  segments.map((segment) =>
    segment.kind === "mark"
      ? segment.text
      : `${segment.kind === "operator" ? "!" : ""}[${segment.text}@${segment.node.join(".")}]`,
  );

describe("the tree", () => {
  test("splits a propositional sentence down to its letters", () => {
    expect(outline(treeOf("carnap-prop", "P /\\ (R -> ~Q)"))).toEqual([
      "P /\\ (R -> ~Q)",
      "  P ·",
      "  R -> ~Q",
      "    R ·",
      "    ~Q",
      "      Q ·",
    ]);
  });

  test("splits a quantifier off its scope, the variable going with it", () => {
    const tree = treeOf("forallx-calgary", "Ax(F(x) & ExG(x))");

    expect(outline(tree)).toEqual([
      "∀x(F(x) ∧ ∃xG(x))",
      "  F(x) ∧ ∃xG(x)",
      "    F(x) ·",
      "    ∃xG(x)",
      "      G(x) ·",
    ]);
    expect(show(tree.nodes[0]?.segments ?? [])).toEqual([
      "![∀x@]",
      "(",
      "[F(x)@1.0]",
      " ",
      "![∧@1]",
      " ",
      "![∃x@1.1]",
      "[G(x)@1.1.1]",
      ")",
    ]);
  });

  test("reads a modal box as an operator like any other", () => {
    expect(outline(treeOf("open-logic-modal-k", "□(p → ◇q)"))).toEqual([
      "□(p → ◇q)",
      "  p → ◇q",
      "    p ·",
      "    ◇q",
      "      q ·",
    ]);
  });

  test("takes ⊥ and an identity as atoms", () => {
    const tree = treeOf("forallx-calgary", "~a = b \\/ _|_");

    expect(outline(tree)).toEqual([
      "¬a = b ∨ ⊥",
      "  ¬a = b",
      "    a = b ·",
      "  ⊥ ·",
    ]);
    expect(pickableCount(tree)).toBe(2);
  });

  test("reads back what it stores", () => {
    const lang = language("forallx-calgary");
    const parsed = lang.parse("Ax(F(x) -> G(x))");

    if (!parsed.ok) {
      throw new Error("does not parse");
    }

    const read = readSentence(lang, printTerm(lang, parsed.term, "engine"));

    expect(read === null ? null : printTerm(lang, read)).toBe(
      "∀x(F(x) → G(x))",
    );
    expect(readSentence(lang, "not a sentence (")).toBeNull();
  });
});

describe("picks", () => {
  const tree = treeOf("carnap-prop", "P /\\ (R -> ~Q)");

  test("a click is right on the node's own operator, wrong on any other", () => {
    expect(isRightPick(tree, { clicked: [], node: [] })).toBe(true);
    expect(isRightPick(tree, { clicked: [1], node: [] })).toBe(false);
    expect(isRightPick(tree, { clicked: [1, 1], node: [1] })).toBe(false);
    expect(isRightPick(tree, { clicked: [1], node: [1] })).toBe(true);
  });

  test("a pick at an atom, or at no node, is never right", () => {
    expect(isRightPick(tree, { clicked: [0], node: [0] })).toBe(false);
    expect(isRightPick(tree, { clicked: [9], node: [9] })).toBe(false);
  });

  test("typing takes any spelling the language has, and names the constructor", () => {
    const forallx = language("forallx-calgary");
    const first = treeOf("forallx-calgary", "P -> (Q & R)");
    const root = first.nodes[0];

    if (root === undefined) {
      throw new Error("no root");
    }

    for (const spelling of ["->", "→", " -> "]) {
      expect(typedPick(forallx, root, spelling)).toEqual({
        named: root.head,
        node: [],
      });
    }

    const wrong = typedPick(forallx, root, "&");

    expect(wrong).not.toBeNull();
    expect(wrong === null ? true : isRightPick(first, wrong)).toBe(false);
  });

  test("typing what is no connective is a slip, not a wrong answer", () => {
    const forallx = language("forallx-calgary");
    const root = treeOf("forallx-calgary", "P -> Q").nodes[0];

    if (root === undefined) {
      throw new Error("no root");
    }

    for (const text of ["", "P", "⊥", "%%"]) {
      expect(typedPick(forallx, root, text)).toBeNull();
    }
  });

  test("an elab spelling counts: Calgary's A is ∀ where the head is ∀", () => {
    const forallx = language("forallx-calgary");
    const tree = treeOf("forallx-calgary", "AxF(x)");
    const root = tree.nodes[0];

    if (root === undefined) {
      throw new Error("no root");
    }

    const pick = typedPick(forallx, root, "A");

    expect(pick === null ? false : isRightPick(tree, pick)).toBe(true);
    expect(typedPick(forallx, root, "∀")).toEqual(pick);
  });
});
