/**
 * What the server view and the client element both draw: which sentences are
 * split and which variables linked, and each drawn line as runs of text with
 * what each run is. The two
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
import type { SyntaxTreePublicData } from "./types";
import { SYNTAX_TREE_ROLE_WORDS } from "./words";

export type SyntaxTreeWords = (
  id: SyntaxTreeStringId,
  values?: Readonly<Record<string, string>>,
) => string;

/**
 * One run of a drawn line. A `connective` is a button: an operator of a
 * sentence still to split, keyed by the node it belongs to and named for a
 * screen reader. On a split line the node's own connective is `main`, the
 * rest `spent`. A `mark` is a bracket or a space.
 *
 * Two more are buttons at `depth="terms"`: a `variable` still to link, which
 * starts a link when pressed, and — while one is being linked — a `binder`,
 * the `main` run of each quantifier above it, which ends one.
 */
export type SentenceRun =
  | {
      readonly kind: "atom" | "main" | "mark" | "spent";
      readonly text: string;
    }
  | {
      readonly kind: "binder" | "connective";
      readonly label: string | null;
      readonly node: string;
      readonly text: string;
    }
  | {
      readonly kind: "variable";
      readonly label: string;
      readonly node: string;
      /** This is the variable being linked. */
      readonly pressed: boolean;
      readonly text: string;
    };

/** The class each kind of run is drawn with; a mark is bare text. */
export const RUN_CLASS = {
  atom: "st-atom",
  binder: "st-bind",
  connective: "st-op",
  main: "st-op",
  spent: "st-op-text",
  variable: "st-var",
} as const;

export interface DrawnNode {
  /** The node's {@link pathKey}. */
  readonly key: string;
  /**
   * `unlinked` and `linked` are a variable leaf still to link and one linked;
   * every other leaf is an `atom`.
   */
  readonly state: "atom" | "linked" | "open" | "split" | "unlinked";
  readonly runs: readonly SentenceRun[];
  /** The immediate subsentences, drawn under a split node only. */
  readonly children: readonly DrawnNode[];
  /**
   * A linked variable's link: the key of the quantifier node it is drawn
   * bound by (`null` when free), and what to say of it in words — shown when
   * free, read by a screen reader when bound, where a line shows the rest.
   */
  readonly link: {
    readonly boundBy: string | null;
    readonly note: string;
  } | null;
}

/**
 * What a run of picks has settled, as drawn: the nodes split, and each
 * linked variable's quantifier (`null` for free). Under `partial` that is the
 * truth at every node picked, whatever was picked there.
 */
export interface ShownAnswers {
  readonly split: ReadonlySet<string>;
  readonly links: ReadonlyMap<string, string | null>;
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

/** A button's name: its symbol, then what the node it splits is called. */
function operatorLabel(
  resolved: ResolvedSyntaxTree,
  owner: SyntaxTreeNode | undefined,
  text: string,
  words: SyntaxTreeWords,
): string | null {
  const role =
    owner === undefined
      ? null
      : roleWord(resolved.language, owner.head, words);

  return role === null
    ? null
    : words("{symbol}, {role}", { role, symbol: text });
}

/** A node's own operator as its line prints it: `∀x`, `∧`. */
function operatorText(node: SyntaxTreeNode): string {
  return node.segments
    .flatMap((segment) =>
      segment.kind === "operator" && segment.node.length === 0
        ? [segment.text]
        : [],
    )
    .join(" ");
}

function sentenceRuns(
  resolved: ResolvedSyntaxTree,
  node: SyntaxTreeNode,
  state: DrawnNode["state"],
  binders: ReadonlySet<string>,
  linking: string | null,
  words: SyntaxTreeWords,
): SentenceRun[] {
  const key = pathKey(node.path);

  return node.segments.map((segment): SentenceRun => {
    const text = segment.text;

    if (segment.kind === "mark") {
      return { kind: "mark", text };
    }

    if (state === "unlinked") {
      return {
        kind: "variable",
        label: words("Link {variable}", { variable: text }),
        node: key,
        pressed: linking === key,
        text,
      };
    }

    if (segment.kind === "atom" || node.atom) {
      return { kind: "atom", text };
    }

    // A split node's connectives are no longer a question; its own stays
    // marked so the line shows what it was split at, and is what a variable
    // being linked to this quantifier is linked to.
    if (state === "split") {
      if (segment.node.length > 0) {
        return { kind: "spent", text };
      }

      return binders.has(key)
        ? {
            kind: "binder",
            label: operatorLabel(resolved, node, text, words),
            node: key,
            text,
          }
        : { kind: "main", text };
    }

    const path = [...node.path, ...segment.node];

    return {
      kind: "connective",
      label: operatorLabel(
        resolved,
        nodeAt(resolved.tree, path),
        text,
        words,
      ),
      node: pathKey(path),
      text,
    };
  });
}

/**
 * The quantifiers a variable could be linked to: every node above it that
 * binds. Offering only those is what the drawing already says — a link runs
 * up the tree — and the variable's own name is still the student's to match.
 */
function binderKeys(
  resolved: ResolvedSyntaxTree,
  key: string | null,
): Set<string> {
  const leaf = key === null ? undefined : resolved.tree.byPath.get(key);

  if (leaf === undefined) {
    return new Set();
  }

  return new Set(
    leaf.path.flatMap((_, length) => {
      const above = nodeAt(resolved.tree, leaf.path.slice(0, length));

      return above?.binds === true ? [pathKey(above.path)] : [];
    }),
  );
}

/**
 * The tree as far as `shown` has split and linked it: the root, and under
 * each split node its immediate children, each with its line in runs.
 * `linking` is the variable being linked, whose quantifiers are buttons.
 */
export function drawnTree(
  resolved: ResolvedSyntaxTree,
  shown: ShownAnswers,
  words: SyntaxTreeWords,
  linking: string | null = null,
): DrawnNode {
  const { nodes } = resolved.tree;
  const binders = binderKeys(resolved, linking);
  const draw = (node: SyntaxTreeNode): DrawnNode => {
    const key = pathKey(node.path);
    const boundBy = shown.links.get(key);
    const state: DrawnNode["state"] =
      node.link !== null
        ? boundBy === undefined
          ? "unlinked"
          : "linked"
        : node.atom
          ? "atom"
          : shown.split.has(key)
            ? "split"
            : "open";
    const binder =
      boundBy == null ? undefined : resolved.tree.byPath.get(boundBy);

    return {
      children:
        state === "split"
          ? node.children.flatMap((index) => {
              const child = nodes[index];

              return child === undefined ? [] : [draw(child)];
            })
          : [],
      key,
      link:
        boundBy === undefined
          ? null
          : {
              boundBy,
              note:
                binder === undefined
                  ? words("free")
                  : words("bound by {quantifier}", {
                      quantifier: operatorText(binder),
                    }),
            },
      runs: sentenceRuns(resolved, node, state, binders, linking, words),
      state,
    };
  };
  const root = nodes[0];

  if (root === undefined) {
    throw new Error("A syntax tree has at least its root.");
  }

  return draw(root);
}

/**
 * What is drawn settled: a node is split, or a variable linked, once it has
 * a pick — the right one under `whole`, any one under `partial`, where the
 * truth is shown whatever was picked.
 */
export function shownAnswers(
  resolved: ResolvedSyntaxTree,
  publicData: SyntaxTreePublicData,
  picks: readonly Pick[],
): ShownAnswers {
  const split = new Set<string>();
  const links = new Map<string, string | null>();

  for (const pick of countedPicks(resolved.tree, picks)) {
    if (
      publicData.scoring !== "partial" &&
      !isRightPick(resolved.tree, pick)
    ) {
      continue;
    }

    const key = pathKey(pick.node);
    const link = resolved.tree.byPath.get(key)?.link;

    if ("linked" in pick) {
      links.set(key, link?.boundBy == null ? null : pathKey(link.boundBy));
    } else {
      split.add(key);
    }
  }

  return { links, split };
}
