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
 * At `depth="terms"` the tree goes on below the atoms: every node of the parse
 * is a node, whatever its sort, so an atom splits at its predicate, `=` or
 * function symbol, down to variables and names. Three kinds of parse node are
 * looked through rather than drawn, because a reader sees nothing of them: a
 * coercion, a node of the argument-list sort (a predicate's arguments are its
 * children, not a list), and the variable a quantifier binds, which is part of
 * its operator (`∀x`). A variable a quantifier could bind is a leaf with one
 * more question: which quantifier binds it, or none.
 *
 * Each node's sentence is printed on its own, as the language prints it, so a
 * child appears without the brackets it needed in its parent, and the student
 * reads every line of the tree the way the language writes a sentence.
 */

import type { AppTerm, SurfaceLanguage, Term } from "@aufbau/syntax";
import { bindingSites, printPieces, printTerm } from "@aufbau/syntax";
import { argumentListSort, sentenceSort } from "../../../logic/specs/roles";

/** Argument indices from the root sentence down, as `printPieces` paths run. */
export type NodePath = readonly number[];

/**
 * How far the tree goes: to the atomic sentences, or on through their terms
 * to variables and names, with each variable linked to its quantifier.
 */
export type SyntaxTreeDepth = "connectives" | "terms";

export const SYNTAX_TREE_DEPTHS: readonly SyntaxTreeDepth[] = [
  "connectives",
  "terms",
];

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
  /** True for a node with nothing beneath it: nothing left to split. */
  readonly atom: boolean;
  /** True for a node that binds a variable: a quantifier, at any depth. */
  readonly binds: boolean;
  /**
   * For a variable a quantifier could bind, at `depth="terms"`: the path of
   * the node that binds it, `null` when it is free. `null` for every other
   * node, which has no link to make.
   */
  readonly link: { readonly boundBy: NodePath | null } | null;
  /** The node's sentence printed on its own. */
  readonly text: string;
  /** {@link text} in runs, each operator attributed to its node. */
  readonly segments: readonly SentenceSegment[];
}

/** The nodes in preorder: the root first, each node before its subsentences. */
export interface SyntaxTree {
  readonly depth: SyntaxTreeDepth;
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

/**
 * The paths below `term` of its nearest drawn descendants at `depth="terms"`:
 * every argument, except that a binding occurrence belongs to its parent's
 * operator, and a node `hidden` says is looked through to its own arguments.
 */
function termPaths(
  term: Term,
  hidden: (node: AppTerm) => boolean,
): NodePath[] {
  if (term.kind !== "app") {
    return [];
  }

  return term.args.flatMap((arg, at): NodePath[] => {
    if (arg.kind === "variable") {
      return arg.binder ? [] : [[at]];
    }

    return hidden(arg)
      ? termPaths(arg, hidden).map((path) => [at, ...path])
      : [[at]];
  });
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

/** How a tree of one depth finds a node's children, and what it hides. */
interface TreeShape {
  /** The paths, below a node, of its immediate children in the tree. */
  readonly children: (term: Term) => NodePath[];
  /** Whether a printed piece of this node belongs to no one: a list's comma. */
  readonly hidden: (term: Term) => boolean;
}

function treeShape(
  lang: SurfaceLanguage,
  depth: SyntaxTreeDepth,
  sort: string,
): TreeShape {
  if (depth === "connectives") {
    return {
      children: (term) => subsentencePaths(term, sort),
      hidden: () => false,
    };
  }

  const coercions = new Set(lang.spec.coercions.map((info) => info.name));
  const list = argumentListSort(lang);
  const hidden = (term: Term): boolean =>
    term.kind === "app" && (coercions.has(term.term) || term.sort === list);

  return { children: (term) => termPaths(term, hidden), hidden };
}

/**
 * A node's own drawn descendants, every depth, relative to it: `[]` for
 * itself, then theirs. What a printed piece is attributed to, by the longest
 * of these its path begins with.
 */
function nodePathsWithin(term: Term, shape: TreeShape): NodePath[] {
  return [
    [],
    ...shape
      .children(term)
      .flatMap((path) =>
        nodePathsWithin(subterm(term, path), shape).map((inner) => [
          ...path,
          ...inner,
        ]),
      ),
  ];
}

function segmentsOf(
  lang: SurfaceLanguage,
  term: Term,
  shape: TreeShape,
): SentenceSegment[] {
  const owners = nodePathsWithin(term, shape);
  const atoms = owners.filter(
    (path) => shape.children(subterm(term, path)).length === 0,
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
      : piece.kind === "bracket" ||
          piece.kind === "space" ||
          shape.hidden(subterm(term, piece.path))
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

/**
 * The sorts some constructor of `lang` binds a variable of: a variable of any
 * other sort (a sentence letter, a name) is never bound, so has no link.
 */
function bindableSorts(lang: SurfaceLanguage): Set<string> {
  const sorts = new Set<string>();

  for (const info of lang.spec.terms.values()) {
    for (const binding of info.bindings) {
      const type = info.binders[binding.binder]?.type;

      if (type !== undefined && "sort" in type) {
        sorts.add(type.sort);
      }
    }
  }

  return sorts;
}

/** The syntax tree of `sentence`, as deep as `depth`. */
export function syntaxTree(
  lang: SurfaceLanguage,
  sentence: Term,
  depth: SyntaxTreeDepth = "connectives",
): SyntaxTree {
  const sort = sentence.sort;
  const shape = treeShape(lang, depth, sort);
  const nodes: SyntaxTreeNode[] = [];
  // Where each variable occurrence is bound: the binding occurrence's parent
  // is the quantifier, which is the node a student links to.
  const boundBy = new Map(
    depth === "terms"
      ? bindingSites(sentence).map((site) => [
          pathKey(site.path),
          site.binder === null ? null : site.binder.slice(0, -1),
        ])
      : [],
  );
  const bindable = depth === "terms" ? bindableSorts(lang) : new Set();

  const visit = (path: NodePath): number => {
    const term = subterm(sentence, path);
    const index = nodes.length;
    const below = shape.children(term);
    const bound = boundBy.get(pathKey(path));
    // Filled after the push, so the node keeps its preorder place.
    const children: number[] = [];

    nodes.push({
      atom: below.length === 0,
      binds: term.kind === "app" && term.bindings.length > 0,
      children,
      head: term.kind === "app" ? term.term : term.name,
      link:
        term.kind === "variable" &&
        bindable.has(term.sort) &&
        bound !== undefined
          ? { boundBy: bound }
          : null,
      path,
      segments: segmentsOf(lang, term, shape),
      text: printTerm(lang, term),
    });
    children.push(...below.map((relative) => visit([...path, ...relative])));

    return index;
  };

  visit([]);

  return {
    byPath: new Map(nodes.map((node) => [pathKey(node.path), node])),
    depth,
    nodes,
  };
}

/**
 * The sort a sentence is read at: the language's sentence sort, or — at
 * `depth="terms"`, which needs none — `undefined` for any sort the text reads
 * at, so a language of terms alone can be drawn. `null` when connectives need
 * a sentence sort and the language has none.
 */
export function readingSort(
  lang: SurfaceLanguage,
  depth: SyntaxTreeDepth,
): string | undefined | null {
  const sort = sentenceSortOf(lang);

  return sort ?? (depth === "terms" ? undefined : null);
}

/**
 * Read a stored sentence back: the engine text the compiler kept. Without the
 * spec's lints, which were applied when the author's text was first read.
 */
export function readSentence(
  lang: SurfaceLanguage,
  engine: string,
  depth: SyntaxTreeDepth = "connectives",
): Term | null {
  const sort = readingSort(lang, depth);

  if (sort === null) {
    return null;
  }

  const result = lang.parse(engine, {
    lints: false,
    mode: "engine",
    ...(sort === undefined ? {} : { sort }),
  });

  return result.ok ? result.term : null;
}

/**
 * One answer at one node: the operator the student clicked, by the path of the
 * node it belongs to; or, at a variable, the quantifier node they linked it
 * to, `null` for free. Both are kept by structure, never by spelling.
 */
export type Pick =
  | { readonly node: NodePath; readonly clicked: NodePath }
  | { readonly node: NodePath; readonly linked: NodePath | null };

/**
 * Whether `pick` is the kind of answer `node` asks for: a split at a node
 * with something beneath it, a link at a variable a quantifier could bind.
 */
export function asksFor(node: SyntaxTreeNode, pick: Pick): boolean {
  return "linked" in pick ? node.link !== null : !node.atom;
}

/** Whether a pick names its node's main connective, or its true binder. */
export function isRightPick(tree: SyntaxTree, pick: Pick): boolean {
  const node = nodeAt(tree, pick.node);

  if (node === undefined || !asksFor(node, pick)) {
    return false;
  }

  if ("linked" in pick) {
    const truth = node.link?.boundBy ?? null;

    return pick.linked === null || truth === null
      ? pick.linked === truth
      : samePath(pick.linked, truth);
  }

  return samePath(pick.clicked, pick.node);
}

/** Whether a node asks for an answer at all: a split or a link. */
function isPickable(node: SyntaxTreeNode): boolean {
  return !node.atom || node.link !== null;
}

/** How many of the tree's nodes have something to pick. */
export function pickableCount(tree: SyntaxTree): number {
  return tree.nodes.filter(isPickable).length;
}
