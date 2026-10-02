import {
  escapeHtml,
  VISUALLY_HIDDEN_STYLES,
} from "../application/content/render-support";
import type { Translator } from "../i18n/translator";
import groupStyles from "./group.css" with { type: "text" };
import { EXERCISE_TOKEN_STYLES } from "./tokens";

/**
 * Every exercise, of every kind, is one named group: a `<fieldset>` whose
 * `<legend>` is the author's title. Assistive technology announces the group name
 * on entering the controls, which is what tells a reader working through a lesson
 * *which* exercise the field in front of them belongs to — otherwise a page of a
 * dozen exercises is a dozen fields all called "Answer".
 *
 * Dependency-free apart from `escapeHtml`, because the per-type
 * `read-only-view.ts` files reach this module and they are compiled into the
 * browser preview bundle. It does not know the types: the generic name for an
 * untitled group is the type's own `name(i18n)`, which each renderer passes in.
 */

/**
 * The rank of an exercise's heading. Never 1: the page or the lesson above the
 * exercise holds that rank.
 */
export type ExerciseHeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * An exercise's place in the document it is drawn in, which only the document
 * knows (see `exerciseOutline`, which walks it): the rank of its heading, and
 * its position among the document's exercises, counting from 1.
 */
export interface ExerciseHeading {
  readonly level: ExerciseHeadingLevel;
  readonly number: number;
}

/**
 * The rank of a heading inside an exercise — a widget's own panel titles —
 * one below the exercise's, so that they read as its parts.
 */
export function exerciseSubheadingLevel(
  level: ExerciseHeadingLevel,
): ExerciseHeadingLevel {
  return Math.min(level + 1, 6) as ExerciseHeadingLevel;
}

export interface ExerciseGroupLabel {
  /** The heading's rank. */
  readonly level: ExerciseHeadingLevel;
  /** The legend's text. */
  readonly text: string;
  /** Whether to hide it from sight (true when it is the generic kind name). */
  readonly hidden: boolean;
}

/**
 * The name for one exercise group: the author's title when there is one, and
 * otherwise its number and the generic kind name (`ExerciseType.name`) —
 * "Exercise 3: Truth table" — hidden from sight.
 *
 * The fallback is deliberately *not* the exercise id. An id is an authoring
 * handle — `tt_affirming`, `ex_3` — and printing it as a heading is worse than
 * printing nothing. But a group with no name at all is no group as far as
 * assistive technology is concerned, so an untitled exercise still gets a name;
 * it is just one only a screen reader hears, leaving the page visually unchanged.
 * The number is what tells ten untitled truth tables apart, moving from heading
 * to heading, and it counts every exercise on the page, titled or not, so that
 * an instructor told "exercise 3" can find it by counting.
 */
export function exerciseGroupLabel(
  kindName: string,
  exercise: {
    readonly heading: ExerciseHeading;
    readonly i18n: Translator;
    readonly title?: string | null | undefined;
  },
): ExerciseGroupLabel {
  const authored = exercise.title?.trim() ?? "";
  const { level, number } = exercise.heading;
  // A local named `i18n`, which is what Lingui's extractor matches.
  const i18n = exercise.i18n;

  return authored.length > 0
    ? { hidden: false, level, text: authored }
    : {
        hidden: true,
        level,
        text: i18n.t("Exercise {number}: {kind}", { kind: kindName, number }),
      };
}

/**
 * {@link exerciseGroupLabel} as markup, for the string-building renderers.
 *
 * The legend holds a heading, which HTML allows, so the one name is both the
 * group's — announced on entering its controls — and a heading, which is how a
 * screen-reader user moves through a page of exercises. The heading takes the
 * legend's look whole (`group.css`): it adds a stop for the H key, not a
 * second typographic voice.
 */
export function exerciseLegendHtml(label: ExerciseGroupLabel): string {
  const className = label.hidden
    ? "exercise-legend visually-hidden"
    : "exercise-legend";

  return `<legend class="${className}"><h${label.level} class="exercise-heading">${escapeHtml(label.text)}</h${label.level}></legend>`;
}

export const EXERCISE_GROUP_STYLES = groupStyles;

/**
 * {@link EXERCISE_GROUP_STYLES} for a widget's **shadow root**, which inherits no
 * page CSS: it ships the rule that hides the generic legend alongside the group
 * itself, so a widget cannot render the group without the means to hide its name
 * — and the exercise tokens' defaults (`tokens.css`), so it cannot render the
 * group without the colours its own rules read.
 *
 * The first coupling is the fix for a shipped bug — the three proof widgets of
 * the day interpolated the group styles alone, so every *untitled* proof
 * printed "PROOF" / "PROOF TREE" / "FITCH PROOF" above its editor:
 * `visually-hidden` with nothing in the root to act on it. `tests/exercise-contract.test.ts` now checks every shadow
 * root that emits the class also carries the rule, and that every root carries
 * the token block.
 *
 * The page stylesheet keeps its own independent `.visually-hidden` (used app-wide),
 * so `EXERCISE_GROUP_STYLES` stays free of it there.
 */
export const EXERCISE_GROUP_SHADOW_STYLES = `${EXERCISE_TOKEN_STYLES}
${VISUALLY_HIDDEN_STYLES}
${EXERCISE_GROUP_STYLES}`;
