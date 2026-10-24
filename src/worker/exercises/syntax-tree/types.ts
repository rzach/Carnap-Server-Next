import type { ExerciseCapabilities } from "../../domain/exercises";
import type { Translator } from "../../i18n/translator";
import type { Pick } from "./logic/tree";

/**
 * Constants and data shapes for the syntax-tree exercise type. DOM-free; the
 * logic core, authoring, assessment, view, and client element all share it.
 */

export const SYNTAX_TREE_KIND = "syntax-tree@1";
export const SYNTAX_TREE_SCHEMA_VERSION = 1;
export const SYNTAX_TREE_ANSWER_KIND = "syntax-tree-answer@1";
export const SYNTAX_TREE_COMPONENT_METADATA = {
  assetId: "carnap-syntax-tree-v1",
  clientModule: true,
  component: "carnap-syntax-tree",
  componentVersion: "1",
} as const;

export const SYNTAX_TREE_CAPABILITIES: ExerciseCapabilities = {
  supportsAutomaticEvaluation: true,
  supportsManualReview: true,
};

/** The generic group name for an untitled exercise of this type. */
export function syntaxTreeName(i18n: Translator): string {
  return i18n.t("Syntax tree");
}

/**
 * How the tree is scored:
 *   - `whole`   (the default) all or nothing. A wrong pick starts the whole
 *               tree over, as old Carnap's checker did, which is what keeps a
 *               student from clicking every connective in turn. The restart
 *               is a verdict, so it happens under any `feedback`.
 *   - `partial` one pick per node, after which the true split is shown either
 *               way; the score is the share of nodes picked right.
 */
export type SyntaxTreeScoring = "whole" | "partial";

export const SYNTAX_TREE_SCORINGS: readonly SyntaxTreeScoring[] = [
  "whole",
  "partial",
];

export interface SyntaxTreePublicData {
  readonly promptHtml: string;
  /** Which of the document's systems the sentence is written in. */
  readonly system: string;
  /** The system's text, which the join fills in on every read. */
  readonly source?: string;
  /** The sentence to decompose, as engine text. */
  readonly sentence: string;
  readonly scoring: SyntaxTreeScoring;
}

/**
 * A submitted answer: the picks the tree was built from, in the order they
 * were made. Under `whole` a wrong pick restarts the tree, so what is sent is
 * the run since the last restart; under `partial`, each node's one pick.
 */
export interface SyntaxTreeAnswerData {
  readonly picks: readonly Pick[];
}
