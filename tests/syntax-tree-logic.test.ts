import { describe, expect, test } from "bun:test";
import type { SurfaceLanguage } from "@aufbau/syntax";
import { printTerm } from "@aufbau/syntax";

import type {
  SentenceSegment,
  SyntaxTree,
  SyntaxTreeDepth,
} from "../src/worker/exercises/syntax-tree/logic/tree";
import {
  asksFor,
  isRightPick,
  pickableCount,
  readingSort,
  readSentence,
  syntaxTree,
} from "../src/worker/exercises/syntax-tree/logic/tree";
import { languageById, readLanguage } from "../src/worker/logic/specs";

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

/**
 * A language of numerals alone: no sentences at all, so no sentence sort,
 * which only `depth="terms"` can draw.
 */
const NUMERALS = `delimiter $ ( ) $;
sort nat;
term zero: nat;
term suc: nat > nat;
term plus: nat > nat > nat;
notation zero: nat = ($0$:max);
prefix suc: $S$ prec 100;
infixl plus: $+$ prec 50;
`;

function numerals(): SurfaceLanguage {
  const read = readLanguage(NUMERALS).language;

  if (read === null) {
    throw new Error("the numerals do not read");
  }

  return read;
}

/** The tree of `text` in `lang`, a built-in language by id or one read here. */
function treeOf(
  lang: string | SurfaceLanguage,
  text: string,
  depth: SyntaxTreeDepth = "connectives",
): SyntaxTree {
  const surface = typeof lang === "string" ? language(lang) : lang;
  const sort = readingSort(surface, depth);
  const parsed = surface.parse(text, sort == null ? {} : { sort });

  if (!parsed.ok) {
    throw new Error(`${text}: ${parsed.diagnostics[0]?.message}`);
  }

  return syntaxTree(surface, parsed.term, depth);
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
});

describe("the tree through its terms", () => {
  test("splits an atom at its predicate, = and function symbols, down to variables and names", () => {
    const tree = treeOf("forallx-calgary", "Ax(F(x,a) -> x = f(b))", "terms");

    expect(outline(tree)).toEqual([
      "∀x(F(x,a) → x = f(b))",
      "  F(x,a) → x = f(b)",
      "    F(x,a)",
      "      x ·",
      "      a ·",
      "    x = f(b)",
      "      x ·",
      "      f(b)",
      "        b ·",
    ]);
    // The argument list's comma is no one's to pick; the predicate is.
    expect(show(tree.nodes[2]?.segments ?? [])).toEqual([
      "![F@]",
      "(",
      "[x@0.0.0.0]",
      ",",
      "[a@0.1.0.0]",
      ")",
    ]);
  });

  test("links each variable to the quantifier that binds it, the innermost one", () => {
    const tree = treeOf("forallx-calgary", "Ax(F(x) & Ex G(x))", "terms");
    const links = tree.nodes.flatMap((node) =>
      node.link === null
        ? []
        : [[node.path.join("."), node.link.boundBy?.join(".") ?? null]],
    );

    expect(links).toEqual([
      ["1.0.0.0.0", ""],
      ["1.1.1.0.0.0", "1.1"],
    ]);
    // Five splits (∀x, ∧, F, ∃x, G) and two links.
    expect(pickableCount(tree)).toBe(7);
  });

  test("a link is right only to the binding quantifier, and a split pick is no link", () => {
    const tree = treeOf("forallx-calgary", "Ax(F(x) & Ex G(x))", "terms");
    const inner = { node: [1, 1, 1, 0, 0, 0] };
    const leaf = tree.byPath.get("1.1.1.0.0.0");

    expect(isRightPick(tree, { ...inner, linked: [1, 1] })).toBe(true);
    expect(isRightPick(tree, { ...inner, linked: [] })).toBe(false);
    expect(isRightPick(tree, { ...inner, linked: null })).toBe(false);
    expect(
      leaf === undefined ? true : asksFor(leaf, { ...inner, clicked: [] }),
    ).toBe(false);
    // A link at a node that is no variable asks for nothing.
    expect(isRightPick(tree, { linked: null, node: [] })).toBe(false);
  });

  test("names, sentence letters and sentence-sorted leaves have no link", () => {
    const tree = treeOf("forallx-calgary", "Ax(F(x) -> P) & G(a)", "terms");

    expect(
      tree.nodes
        .filter((node) => node.link !== null)
        .map((node) => node.text),
    ).toEqual(["x"]);
  });

  test("draws a language with no sentence sort, and reads it back", () => {
    const lang = numerals();
    const parsed = lang.parse("S(0) + 0");

    if (!parsed.ok) {
      throw new Error("the numeral does not read");
    }

    const back = readSentence(
      lang,
      printTerm(lang, parsed.term, "engine"),
      "terms",
    );

    expect(readingSort(lang, "connectives")).toBeNull();
    expect(outline(treeOf(lang, "S(0) + 0", "terms"))).toEqual([
      "S 0 + 0",
      "  S 0",
      "    0 ·",
      "  0 ·",
    ]);
    expect(back === null ? null : printTerm(lang, back)).toBe("S 0 + 0");
  });
});
