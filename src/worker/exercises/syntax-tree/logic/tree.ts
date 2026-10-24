/**
 * A sentence's syntax tree as the syntax-tree exercise draws and grades it:
 * every subsentence a node, its immediate subsentences its children, an atom
 * a leaf. DOM-free — the worker grades against it and the client element
 * draws from it, so both sides read the tree from this one function.
 *
 * Nothing here knows a connective. The tree is the parse's own: a node is any
 * node of the sentence's sort, its children are the nearest nodes of that sort
 * beneath it, and its *operator* is whatever it prints that no child prints —
 * `∧`, `¬`, `∀x`, `□`, or a two-token notation's two tokens. So a quantifier,
 * a modal box, or a connective an author declares in their own language
 * decomposes the same way `∧` does, with nothing to register.
 *
 * Each node's sentence is printed on its own, as the language prints it, so a
 * child appears without the brackets it needed in its parent, and the student
 * reads every line of the tree the way the language writes a sentence.
 */

import type { SurfaceLanguage, Term } from "@aufbau/syntax";
import { printPieces, printTerm, spellingMeanings } from "@aufbau/syntax";
import { sentenceSort } from "../../../logic/specs/roles";

/** Argument indices from the root sentence down, as `printPieces` paths run. */
export type NodePath = readonly number[];

/**
 * A run of a node's printed sentence. An `operator` run is the operator of
 * the node at `node` (relative to the sentence printed), an `atom` run is the
 * whole of an atom's text, and a `mark` is a bracket or a space, which belongs
 * to no one a student could pick.
 */
export type SentenceSegment =
  | {
      readonly kind: "operator";
      readonly node: NodePath;
      readonly text: string;
    }
  | { readonly kind: "atom"; readonly node: NodePath; readonly text: string }
  | { readonly kind: "mark"; readonly text: string };

export interface SyntaxTreeNode {
  /** Where the node sits in the root sentence. */
  readonly path: NodePath;
  /** The constructor at the node; a variable's name for a sentence variable. */
  readonly head: string;
  /** Indices into {@link SyntaxTree.nodes} of the immediate subsentences. */
  readonly children: readonly number[];
  /** True for a node with no subsentences: nothing left to pick. */
  readonly atom: boolean;
  /** The node's sentence printed on its own. */
  readonly text: string;
  /** {@link text} in runs, each operator attributed to its node. */
  readonly segments: readonly SentenceSegment[];
}

/** The nodes in preorder: the root first, each node before its subsentences. */
export interface SyntaxTree {
  readonly nodes: readonly SyntaxTreeNode[];
  /** Each node by its {@link pathKey}. */
  readonly byPath: ReadonlyMap<string, SyntaxTreeNode>;
}

/** How a node path is written as a key and into markup: `1.0`, `` for the root. */
export function pathKey(path: NodePath): string {
  return path.join(".");
}

/** {@link pathKey} read back. */
export function parsePathKey(key: string): number[] {
  return key === "" ? [] : key.split(".").map(Number);
}

/** The node at `path`, if the tree has one. */
export function nodeAt(
  tree: SyntaxTree,
  path: NodePath,
): SyntaxTreeNode | undefined {
  return tree.byPath.get(pathKey(path));
}

function samePath(left: NodePath, right: NodePath): boolean {
  return (
    left.length === right.length &&
    left.every((index, at) => index === right[at])
  );
}

function isPrefix(prefix: NodePath, path: NodePath): boolean {
  return (
    prefix.length <= path.length &&
    prefix.every((index, at) => index === path[at])
  );
}

/** The sort a sentence of `lang` is read at. */
export function sentenceSortOf(lang: SurfaceLanguage): string | null {
  return sentenceSort(lang) ?? lang.provableSort;
}

/**
 * The paths below `term` of its nearest sentence-sorted descendants: through
 * coercions and any non-sentence node between, so `F(ιx Gx)`'s `Gx` would be
 * a subsentence of the atom it sits in, as it is of the sentence.
 */
function subsentencePaths(term: Term, sort: string): NodePath[] {
  if (term.kind !== "app") {
    return [];
  }

  return term.args.flatMap((arg, at) =>
    arg.sort === sort
      ? [[at]]
      : subsentencePaths(arg, sort).map((path) => [at, ...path]),
  );
}

function subterm(term: Term, path: NodePath): Term {
  let at = term;

  for (const index of path) {
    const next = at.kind === "app" ? at.args[index] : undefined;

    if (next === undefined) {
      throw new Error(`No subterm at ${path.join(".")}.`);
    }

    at = next;
  }

  return at;
}

/**
 * The sentence's own subsentence paths, every depth, relative to it:
 * `[]` for itself, then its descendants. What a printed piece is attributed
 * to, by the longest of these its path begins with.
 */
function sentencePathsWithin(term: Term, sort: string): NodePath[] {
  return [
    [],
    ...subsentencePaths(term, sort).flatMap((path) =>
      sentencePathsWithin(subterm(term, path), sort).map((inner) => [
        ...path,
        ...inner,
      ]),
    ),
  ];
}

function segmentsOf(
  lang: SurfaceLanguage,
  term: Term,
  sort: string,
): SentenceSegment[] {
  const owners = sentencePathsWithin(term, sort);
  const atoms = owners.filter(
    (path) => subsentencePaths(subterm(term, path), sort).length === 0,
  );
  const out: SentenceSegment[] = [];

  for (const piece of printPieces(lang, term)) {
    let owner: NodePath = [];

    for (const path of owners) {
      if (path.length > owner.length && isPrefix(path, piece.path)) {
        owner = path;
      }
    }

    const atom = atoms.some((path) => samePath(path, owner));
    const kind = atom
      ? "atom"
      : piece.kind === "bracket" || piece.kind === "space"
        ? "mark"
        : "operator";
    const last = out.at(-1);

    // An atom is one run whatever it prints as — `F(a)` is a name and its
    // brackets — and an operator's adjacent pieces are one: `∀` and its `x`.
    if (
      kind !== "mark" &&
      last !== undefined &&
      last.kind === kind &&
      samePath(last.node, owner)
    ) {
      out[out.length - 1] = { ...last, text: last.text + piece.text };
    } else if (kind === "mark") {
      out.push({ kind, text: piece.text });
    } else {
      out.push({ kind, node: owner, text: piece.text });
    }
  }

  return out;
}

/** The syntax tree of a sentence `lang` read at its sentence sort. */
export function syntaxTree(
  lang: SurfaceLanguage,
  sentence: Term,
): SyntaxTree {
  const sort = sentence.sort;
  const nodes: SyntaxTreeNode[] = [];

  const visit = (path: NodePath): number => {
    const term = subterm(sentence, path);
    const index = nodes.length;
    const below = subsentencePaths(term, sort);
    // Filled after the push, so the node keeps its preorder place.
    const children: number[] = [];

    nodes.push({
      atom: below.length === 0,
      children,
      head: term.kind === "app" ? term.term : term.name,
      path,
      segments: segmentsOf(lang, term, sort),
      text: printTerm(lang, term),
    });
    children.push(...below.map((relative) => visit([...path, ...relative])));

    return index;
  };

  visit([]);

  return {
    byPath: new Map(nodes.map((node) => [pathKey(node.path), node])),
    nodes,
  };
}

/**
 * Read a stored sentence back: the engine text the compiler kept. Without the
 * spec's lints, which were applied when the author's text was first read.
 */
export function readSentence(
  lang: SurfaceLanguage,
  engine: string,
): Term | null {
  const sort = sentenceSortOf(lang);

  if (sort === null) {
    return null;
  }

  const result = lang.parse(engine, { lints: false, mode: "engine", sort });

  return result.ok ? result.term : null;
}

/**
 * One answer at one node: the operator the student clicked, by the path of the
 * node it belongs to, or the constructor they named by typing. Both are kept
 * by structure, never by spelling, so a typed `->` and a clicked `→` are the
 * same answer.
 */
export type Pick =
  | { readonly node: NodePath; readonly clicked: NodePath }
  | { readonly node: NodePath; readonly named: string };

/** Whether a pick names its node's main connective. */
export function isRightPick(tree: SyntaxTree, pick: Pick): boolean {
  const node = nodeAt(tree, pick.node);

  if (node === undefined || node.atom) {
    return false;
  }

  return "clicked" in pick
    ? samePath(pick.clicked, pick.node)
    : pick.named === node.head;
}

/**
 * What a typed answer at `node` comes to: the pick it records, or `null` when
 * the text names no connective of the language at all (a letter, a typo),
 * which is a slip to point out rather than a wrong answer.
 *
 * A spelling can stand for more than one constructor (Calgary's `E` is a
 * predicate letter and, through an elab rule, `∃`), so the node's own head
 * wins when it is among them; otherwise the first connective it can mean is
 * the one named. A connective is a constructor of the sentence sort taking a
 * sentence — so `⊥`, which takes none, is no more an answer than `P` is.
 */
export function typedPick(
  lang: SurfaceLanguage,
  node: SyntaxTreeNode,
  text: string,
): Pick | null {
  const spelled = text.replace(/\s+/gu, "");
  const sort = node.atom ? null : sentenceSortOf(lang);

  if (spelled === "" || sort === null) {
    return null;
  }

  const meanings = spellingMeanings(lang, spelled).terms;

  if (meanings.includes(node.head)) {
    return { named: node.head, node: node.path };
  }

  const named = meanings.find((name) => {
    const info = lang.spec.terms.get(name);

    return (
      info !== undefined &&
      info.returnSort === sort &&
      info.binders.some(
        (binder) => "sort" in binder.type && binder.type.sort === sort,
      )
    );
  });

  return named === undefined ? null : { named, node: node.path };
}

/** How many of the tree's nodes have something to pick. */
export function pickableCount(tree: SyntaxTree): number {
  return tree.nodes.filter((node) => !node.atom).length;
}
