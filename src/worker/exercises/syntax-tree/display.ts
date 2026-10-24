/**
 * What the server view and the client element both draw: which sentences are
 * split, and each drawn line as runs of text with what each run is. The two
 * then only write it out — the server as a string, the element with DOM
 * calls — so neither decides anything about the tree the other could decide
 * differently. DOM-free and free of i18n, so the element bundles it without
 * the server view's styles and markup helpers.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import { roleIndex } from "../../logic/specs/roles";
import type { ResolvedSyntaxTree } from "./grading";
import { countedPicks } from "./grading";
import type { Pick, SyntaxTreeNode } from "./logic/tree";
import { isRightPick, nodeAt, pathKey } from "./logic/tree";
import type { SyntaxTreeStringId } from "./strings";
import { SYNTAX_TREE_ROLE_WORDS } from "./strings";
import type { SyntaxTreePublicData } from "./types";

export type SyntaxTreeWords = (
  id: SyntaxTreeStringId,
  values?: Readonly<Record<string, string>>,
) => string;

/**
 * One run of a drawn line. A `connective` is a button: an operator of a
 * sentence still to split, keyed by the node it belongs to and named for a
 * screen reader. On a split line the node's own connective is `main`, the
 * rest `spent`. A `mark` is a bracket or a space.
 */
export type SentenceRun =
  | {
      readonly kind: "atom" | "main" | "mark" | "spent";
      readonly text: string;
    }
  | {
      readonly kind: "connective";
      readonly label: string | null;
      readonly node: string;
      readonly text: string;
    };

/** The class each kind of run is drawn with; a mark is bare text. */
export const RUN_CLASS = {
  atom: "st-atom",
  connective: "st-op",
  main: "st-op",
  spent: "st-op-text",
} as const;

export interface DrawnNode {
  /** The node's {@link pathKey}. */
  readonly key: string;
  readonly state: "atom" | "open" | "split";
  readonly runs: readonly SentenceRun[];
  /** The immediate subsentences, drawn under a split node only. */
  readonly children: readonly DrawnNode[];
}

/**
 * What a constructor is called, for a connective button's accessible name:
 * `conjunction` for a constructor with `@syntax role conjunction`, and `null`
 * for one whose role has no word here, whose button is then named by its
 * symbol alone.
 */
function roleWord(
  lang: SurfaceLanguage,
  head: string,
  words: SyntaxTreeWords,
): string | null {
  const role = roleIndex(lang).roleOf(head);
  const word = role === null ? undefined : SYNTAX_TREE_ROLE_WORDS[role];

  return word === undefined ? null : words(word);
}

function sentenceRuns(
  resolved: ResolvedSyntaxTree,
  node: SyntaxTreeNode,
  split: boolean,
  words: SyntaxTreeWords,
): SentenceRun[] {
  return node.segments.map((segment): SentenceRun => {
    const text = segment.text;

    if (segment.kind === "mark") {
      return { kind: "mark", text };
    }

    if (segment.kind === "atom" || node.atom) {
      return { kind: "atom", text };
    }

    // A split node's connectives are no longer a question; its own stays
    // marked so the line shows what it was split at.
    if (split) {
      return { kind: segment.node.length === 0 ? "main" : "spent", text };
    }

    const path = [...node.path, ...segment.node];
    const owner = nodeAt(resolved.tree, path);
    const role =
      owner === undefined
        ? null
        : roleWord(resolved.language, owner.head, words);

    return {
      kind: "connective",
      label:
        role === null
          ? null
          : words("{symbol}, {role}", { role, symbol: text }),
      node: pathKey(path),
      text,
    };
  });
}

/**
 * The tree as far as `split` has split it: the root, and under each split
 * node its immediate subsentences, each with its line in runs.
 */
export function drawnTree(
  resolved: ResolvedSyntaxTree,
  split: ReadonlySet<string>,
  words: SyntaxTreeWords,
): DrawnNode {
  const { nodes } = resolved.tree;
  const draw = (node: SyntaxTreeNode): DrawnNode => {
    const key = pathKey(node.path);
    const isSplit = !node.atom && split.has(key);

    return {
      children: isSplit
        ? node.children.flatMap((index) => {
            const child = nodes[index];

            return child === undefined ? [] : [draw(child)];
          })
        : [],
      key,
      runs: sentenceRuns(resolved, node, isSplit, words),
      state: node.atom ? "atom" : isSplit ? "split" : "open",
    };
  };
  const root = nodes[0];

  if (root === undefined) {
    throw new Error("A syntax tree has at least its root.");
  }

  return draw(root);
}

/**
 * The first sentence, in preorder, that is drawn and still to split — the
 * one a typed connective answers — or `null` once the tree is finished.
 */
export function firstOpen(drawn: DrawnNode): string | null {
  if (drawn.state === "open") {
    return drawn.key;
  }

  for (const child of drawn.children) {
    const found = firstOpen(child);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

/**
 * Which nodes are drawn split: a node is split once it has a pick that
 * splits it — the right one under `whole`, any one under `partial`, where the
 * true split is shown whatever was picked.
 */
export function splitNodes(
  resolved: ResolvedSyntaxTree,
  publicData: SyntaxTreePublicData,
  picks: readonly Pick[],
): Set<string> {
  return new Set(
    countedPicks(resolved.tree, picks)
      .filter(
        (pick) =>
          publicData.scoring === "partial" ||
          isRightPick(resolved.tree, pick),
      )
      .map((pick) => pathKey(pick.node)),
  );
}
