/**
 * Stored exercise data turned back into a tree to grade against, and the
 * grade itself. DOM-free and free of i18n, because the client element reads
 * the same public data to draw the tree and to set its mark.
 *
 * There is no answer key: the tree follows from the sentence, which is public,
 * so the server grades by building it again rather than by comparing against
 * anything stored.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import { languageFromSource } from "../../logic/specs/read";
import type {
  NodePath,
  Pick,
  SyntaxTree,
  SyntaxTreeDepth,
} from "./logic/tree";
import {
  asksFor,
  isRightPick,
  pathKey,
  pickableCount,
  readSentence,
  SYNTAX_TREE_DEPTHS,
  syntaxTree,
} from "./logic/tree";
import type {
  SyntaxTreeAnswerData,
  SyntaxTreePublicData,
  SyntaxTreeScoring,
} from "./types";
import { SYNTAX_TREE_SCORINGS } from "./types";

export interface ResolvedSyntaxTree {
  readonly language: SurfaceLanguage;
  readonly tree: SyntaxTree;
}

/** The most nodes a stored path may run through: deeper is not a sentence's. */
const MAX_PATH_LENGTH = 256;

function isPath(value: unknown): value is NodePath {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PATH_LENGTH &&
    value.every((index) => Number.isSafeInteger(index) && index >= 0)
  );
}

export function isPick(value: unknown): value is Pick {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const pick = value as Record<string, unknown>;

  // Exactly one of the two: a click or a link (`null` is free), never both.
  return (
    isPath(pick.node) &&
    (pick.linked === undefined
      ? isPath(pick.clicked)
      : pick.clicked === undefined &&
        (pick.linked === null || isPath(pick.linked)))
  );
}

export function isSyntaxTreePublicData(
  value: unknown,
): value is SyntaxTreePublicData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Partial<SyntaxTreePublicData>;

  return (
    typeof data.promptHtml === "string" &&
    typeof data.system === "string" &&
    typeof data.sentence === "string" &&
    SYNTAX_TREE_SCORINGS.includes(data.scoring as SyntaxTreeScoring) &&
    SYNTAX_TREE_DEPTHS.includes(data.depth as SyntaxTreeDepth)
  );
}

export function isSyntaxTreeAnswerData(
  value: unknown,
): value is SyntaxTreeAnswerData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const picks = (value as Record<string, unknown>).picks;

  return Array.isArray(picks) && picks.every(isPick);
}

/**
 * The language and the tree, or `null` where the stored data no longer
 * resolves: a language that does not read or a sentence that will not parse.
 * Neither can happen for data this compiler wrote; each is how a revision
 * from a future version fails safely.
 */
export function resolveSyntaxTree(
  publicData: SyntaxTreePublicData,
): ResolvedSyntaxTree | null {
  const language =
    publicData.source === undefined
      ? null
      : languageFromSource(publicData.source);

  if (language === null) {
    return null;
  }

  const sentence = readSentence(
    language,
    publicData.sentence,
    publicData.depth,
  );

  return sentence === null
    ? null
    : { language, tree: syntaxTree(language, sentence, publicData.depth) };
}

/**
 * The picks that count: one per node, the first made there, and only at a
 * node of this tree that asks for that kind of answer — a split where there
 * is something beneath, a link at a variable. A pick anywhere else is not a
 * wrong answer but no answer, and dropping it keeps a crafted payload from
 * padding the count.
 */
export function countedPicks(
  tree: SyntaxTree,
  picks: readonly Pick[],
): Pick[] {
  const seen = new Set<string>();

  return picks.filter((pick) => {
    const key = pathKey(pick.node);
    const node = tree.byPath.get(key);

    if (node === undefined || !asksFor(node, pick) || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

export interface SyntaxTreeVerdict {
  /** Every node with something to pick — a split or a link — was picked right. */
  readonly ok: boolean;
  /** Nodes picked at all, and picked right, of `total`. */
  readonly picked: number;
  readonly right: number;
  readonly total: number;
}

export function judgeSyntaxTree(
  tree: SyntaxTree,
  picks: readonly Pick[],
): SyntaxTreeVerdict {
  const counted = countedPicks(tree, picks);
  const right = counted.filter((pick) => isRightPick(tree, pick)).length;
  const total = pickableCount(tree);

  return { ok: right === total, picked: counted.length, right, total };
}

/** The share of the points a verdict earns under the exercise's scoring. */
export function verdictScore(
  verdict: SyntaxTreeVerdict,
  scoring: SyntaxTreeScoring,
): number {
  if (verdict.ok) {
    return 1;
  }

  return scoring === "partial" && verdict.total > 0
    ? verdict.right / verdict.total
    : 0;
}
