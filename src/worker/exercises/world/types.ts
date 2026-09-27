import type { ExerciseCapabilities } from "../../domain/exercises";
import type { Translator } from "../../i18n/translator";
/**
 * Constants and data shapes for the world exercise type. DOM-free; the logic
 * core, authoring, assessment, view, and client element all share it.
 */

export const WORLD_KIND = "world@1";
export const WORLD_SCHEMA_VERSION = 1;
export const WORLD_ANSWER_KIND = "world-answer@1";
export const WORLD_COMPONENT_METADATA = {
  assetId: "carnap-world-v1",
  clientModule: true,
  component: "carnap-world",
  componentVersion: "1",
} as const;

export const WORLD_CAPABILITIES: ExerciseCapabilities = {
  supportsAutomaticEvaluation: true,
  supportsManualReview: true,
};

/** The generic group name for an untitled exercise of this type. */
export function worldName(i18n: Translator): string {
  return i18n.t("World");
}

/**
 * The task:
 *   - `evaluate`       say whether each sentence is true in a fixed world;
 *   - `build`          edit the world until every sentence meets its target
 *                      (the default);
 *   - `counterexample` edit the world until the premises are true and the
 *                      conclusions false;
 *   - `distinguish`    write one sentence true in world A and false in B.
 */
export type WorldVariant =
  | "evaluate"
  | "build"
  | "counterexample"
  | "distinguish";

export const WORLD_VARIANTS: readonly WorldVariant[] = [
  "evaluate",
  "build",
  "counterexample",
  "distinguish",
];

/**
 * One sentence of the exercise, in canonical source. `target` is the truth
 * value the student must bring it to: `true` for a build sentence unless the
 * author wrote `false:`, `true` for a premise and `false` for a conclusion.
 * An `evaluate` sentence has no target; the world decides its value.
 */
export interface WorldSentence {
  readonly target?: boolean;
  readonly text: string;
}

/**
 * A distinguish exercise's vocabulary restriction, as the author spelled it.
 * At most one of the two is present; the check resolves the spellings to the
 * language's constructors when it runs.
 */
export interface WorldRestriction {
  readonly symbols?: readonly string[];
  readonly without?: readonly string[];
}

export interface WorldPublicData {
  /** The world kind: `blocks`. */
  readonly world: string;
  readonly variant: WorldVariant;
  readonly promptHtml: string;
  /** Which of the document's systems the sentences are written in. */
  readonly system: string;
  /** The system's text, which the join fills in on every read. */
  readonly source?: string;
  readonly sentences: readonly WorldSentence[];
  /** Sentences that must be true in the submitted world, shown apart. */
  readonly laws: readonly string[];
  /** The world the student starts from (every variant but distinguish). */
  readonly start?: unknown;
  /** Ids of start-world objects the student may not change. */
  readonly pinned: readonly string[];
  /** The most objects a student may add, remove or change, if limited. */
  readonly budget?: number;
  /** A distinguish exercise's two worlds. */
  readonly worlds?: { readonly a: unknown; readonly b: unknown };
  readonly restriction?: WorldRestriction;
}

/**
 * A submitted answer. The declaration's variant decides which field is read;
 * normalization drops the rest.
 *   - `values`: evaluate, one mark per sentence in order, `null` unmarked;
 *   - `world`: build and counterexample, the edited world as kind state;
 *   - `sentence`: distinguish, the text exactly as typed.
 * A recorded move log (`moves`) is reserved for path constraints.
 */
export interface WorldAnswerData {
  readonly sentence?: string;
  readonly values?: readonly (boolean | null)[];
  readonly world?: unknown;
}
