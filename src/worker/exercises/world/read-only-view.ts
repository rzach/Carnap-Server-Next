import {
  type ExerciseElementMeta,
  escapeHtml,
  exerciseRootAttributes,
  VISUALLY_HIDDEN_STYLES,
} from "../../application/content/render-support";
import type { ContentNode } from "../../domain/content";
import { previewExerciseActionsHtml } from "../../exercise-kit/actions";
import {
  EXERCISE_GROUP_SHADOW_STYLES,
  type ExerciseHeading,
  type ExerciseHeadingLevel,
  exerciseGroupLabel,
  exerciseLegendHtml,
  exerciseSubheadingLevel,
} from "../../exercise-kit/group";
import { EXERCISE_TOKEN_STYLES } from "../../exercise-kit/tokens";
import type { ExerciseRenderContext } from "../../exercise-kit/type";
import type { Translator } from "../../i18n/translator";
import { stringsResolver } from "../../i18n/translator";
import { boardHtml } from "./board-html";
import type { ResolvedWorld } from "./grading";
import { isWorldPublicData, resolveWorld } from "./grading";
import type { WorldKind, WorldWords } from "./kinds/contract";
import type { WorldVerdict } from "./logic/check";
import { truthValues } from "./logic/check";
import reviewStyles from "./review.css" with { type: "text" };
import shadowStyles from "./shadow.css" with { type: "text" };
import { buildWorldStrings } from "./strings";
import type { WorldAnswerData, WorldPublicData } from "./types";
import { readsFixedWorld, WORLD_KIND, worldName } from "./types";
import { describeWorldVerdict } from "./verdict-text";

const WORLD_SHADOW_STYLES = [EXERCISE_GROUP_SHADOW_STYLES, shadowStyles].join(
  "\n",
);
const WORLD_REVIEW_STYLES = [
  EXERCISE_TOKEN_STYLES,
  VISUALLY_HIDDEN_STYLES,
  shadowStyles,
  reviewStyles,
].join("\n");

/**
 * The object table: one row per object, in words. It is the accessible form
 * of the board, and in the editor it becomes a complete second editor.
 */
function objectTableHtml(
  kind: WorldKind,
  state: unknown,
  words: WorldWords,
  caption: string,
): string {
  const objects = kind.objects(state);
  const rows = objects
    .map(
      (object) =>
        `<li class="world-object">${escapeHtml(kind.describeObject(state, object.id, words))}</li>`,
    )
    .join("");

  return `<div class="world-objects"><p class="world-objects-caption">${escapeHtml(caption)}</p>${
    rows.length === 0
      ? `<p class="world-empty">${escapeHtml(words("No blocks yet."))}</p>`
      : `<ul class="world-object-list">${rows}</ul>`
  }</div>`;
}

/** One board with its label and its table in words, for a fixed world. */
function worldFigureHtml(
  kind: WorldKind,
  state: unknown,
  words: WorldWords,
  label: string,
  pinned?: ReadonlySet<string>,
): string {
  return `<figure class="world-figure"><figcaption class="world-figure-label">${escapeHtml(label)}</figcaption>${boardHtml(
    kind.draw(state),
    { label, ...(pinned === undefined ? {} : { pinned }) },
  )}${objectTableHtml(kind, state, words, label)}</figure>`;
}

/** What a sentence is to be brought to, in the variant's own terms. */
function targetLabel(
  publicData: WorldPublicData,
  target: boolean | undefined,
  words: WorldWords,
): string {
  if (target === undefined) {
    return "";
  }

  if (publicData.variant === "counterexample") {
    return target ? words("Premise") : words("Conclusion");
  }

  return target ? words("Make true") : words("Make false");
}

interface SentenceMarks {
  /** Truth values to show beside each sentence and law, if any. */
  readonly values?: {
    readonly laws: readonly (boolean | null)[];
    readonly sentences: readonly (boolean | null)[];
  };
  /** An evaluate answer's marks, or a game answer's claims, for the review. */
  readonly marks?: readonly (boolean | null)[];
  readonly disabled: boolean;
}

function truthMark(value: boolean | null | undefined, words: WorldWords) {
  if (value === undefined) {
    return '<span class="world-truth" data-role="truth"></span>';
  }

  const text =
    value === null
      ? words("Cannot be evaluated in this world")
      : value
        ? words("True in this world")
        : words("False in this world");

  return `<span class="world-truth" data-role="truth" data-value="${value === null ? "none" : String(value)}" title="${escapeHtml(text)}"><span aria-hidden="true">${value === null ? "?" : value ? "T" : "F"}</span><span class="visually-hidden">${escapeHtml(text)}</span></span>`;
}

function markToggle(
  index: number,
  text: string,
  mark: boolean | null,
  disabled: boolean,
  words: WorldWords,
  variant: WorldPublicData["variant"],
): string {
  const button = (value: boolean, label: string): string =>
    `<button aria-pressed="${mark === value}" class="world-mark" data-mark="${value}" type="button"${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
  const group =
    variant === "game"
      ? words("{sentence}: your claim", { sentence: text })
      : words("{sentence}: your mark", { sentence: text });

  return `<span aria-label="${escapeHtml(group)}" class="world-marks" data-index="${index}" role="group">${button(true, words("True"))}${button(false, words("False"))}</span>`;
}

function sentencesHtml(
  publicData: WorldPublicData,
  resolved: ResolvedWorld,
  words: WorldWords,
  marks: SentenceMarks,
  level: ExerciseHeadingLevel,
): string {
  if (publicData.variant === "distinguish") {
    return "";
  }

  const items = resolved.sentences
    .map((sentence, index) => {
      const target = targetLabel(publicData, sentence.target, words);
      const control = readsFixedWorld(publicData.variant)
        ? markToggle(
            index,
            sentence.text,
            marks.marks?.[index] ?? null,
            marks.disabled,
            words,
            publicData.variant,
          )
        : truthMark(marks.values?.sentences[index], words);

      return `<li class="world-sentence" data-index="${index}"${sentence.target === undefined ? "" : ` data-target="${sentence.target}"`}>${
        target === ""
          ? ""
          : `<span class="world-target">${escapeHtml(target)}</span>`
      }<span class="world-formula">${escapeHtml(sentence.text)}</span>${control}</li>`;
    })
    .join("");
  const laws =
    resolved.laws.length === 0
      ? ""
      : `<h${level} class="world-panel-heading">${escapeHtml(words("Laws"))}</h${level}><ul class="world-laws">${resolved.laws
          .map(
            (law, index) =>
              `<li class="world-sentence world-law" data-index="${index}"><span class="world-formula">${escapeHtml(law.text)}</span>${truthMark(marks.values?.laws[index], words)}</li>`,
          )
          .join("")}</ul>`;

  return `<h${level} class="world-panel-heading">${escapeHtml(words("Sentences"))}</h${level}><ol class="world-sentences">${items}</ol>${laws}`;
}

function restrictionHtml(
  publicData: WorldPublicData,
  words: WorldWords,
): string {
  const restriction = publicData.restriction;

  if (restriction?.symbols !== undefined) {
    return `<p class="world-restriction">${escapeHtml(words("Allowed symbols: {symbols}", { symbols: restriction.symbols.join(" ") }))}</p>`;
  }

  if (restriction?.without !== undefined) {
    return `<p class="world-restriction">${escapeHtml(words("Not allowed: {symbols}", { symbols: restriction.without.join(" ") }))}</p>`;
  }

  return "";
}

/** The world(s) and the sentence panel, shared by the widget and the review. */
function exerciseBodyHtml(
  publicData: WorldPublicData,
  resolved: ResolvedWorld | null,
  words: WorldWords,
  options: {
    readonly answer?: WorldAnswerData;
    readonly disabled: boolean;
    /** The rank of the panel headings ("Sentences", "Laws"). */
    readonly headingLevel: ExerciseHeadingLevel;
    readonly reveal: boolean;
  },
): string {
  if (resolved === null) {
    return "";
  }

  const { kind } = resolved;

  if (publicData.variant === "distinguish") {
    const worlds = resolved.worlds;
    const boards =
      worlds === null
        ? ""
        : `${worldFigureHtml(kind, worlds.a, words, words("World A"))}${worldFigureHtml(kind, worlds.b, words, words("World B"))}`;
    const sentence = options.answer?.sentence ?? "";

    return `<div class="world-layout world-layout-pair"><div class="world-pair">${boards}</div><div class="world-panel"><label class="world-answer-label" for="world-sentence">${escapeHtml(words("Your sentence"))}</label><input autocomplete="off" class="world-answer" data-role="sentence" id="world-sentence" spellcheck="false" type="text" value="${escapeHtml(sentence)}"${options.disabled ? " disabled" : ""}>${restrictionHtml(publicData, words)}</div></div>`;
  }

  const shown =
    options.answer?.world === undefined
      ? resolved.start
      : (kind.parseState(options.answer.world) ?? resolved.start);
  const values =
    options.reveal &&
    !readsFixedWorld(publicData.variant) &&
    options.answer !== undefined &&
    kind.problems(shown).length === 0
      ? truthValues(resolved, shown)
      : undefined;
  const marks =
    options.answer?.games?.map((game) => game?.claim ?? null) ??
    options.answer?.values;
  const budget =
    publicData.budget === undefined
      ? ""
      : `<p class="world-budget" data-role="budget">${escapeHtml(
          words("Changes: {used} of {limit}", {
            limit: String(publicData.budget),
            used: String(kind.distance(resolved.start, shown)),
          }),
        )}</p>`;

  return `<div class="world-layout"><div class="world-stage" data-role="stage">${worldFigureHtml(
    kind,
    shown,
    words,
    words("The world"),
    resolved.pinned,
  )}${budget}</div><div class="world-panel">${sentencesHtml(
    publicData,
    resolved,
    words,
    {
      disabled: options.disabled,
      ...(marks === undefined ? {} : { marks }),
      ...(values === undefined ? {} : { values }),
    },
    options.headingLevel,
  )}</div></div>`;
}

interface WorldElementMeta extends ExerciseElementMeta {
  readonly i18n: Translator;
  readonly heading: ExerciseHeading;
  readonly title: string | null;
}

/**
 * The world element with its Declarative Shadow Root: inert (controls
 * disabled, `aria-busy`) and correctly drawn with no JS. The island replaces
 * the stage and the panel with the live editor on connect.
 */
export function renderWorldElement(
  publicData: WorldPublicData,
  meta: WorldElementMeta,
  actions = "",
): string {
  const resolved = resolveWorld(publicData);
  const words = stringsResolver(buildWorldStrings(meta.i18n));
  const legend = exerciseLegendHtml(
    exerciseGroupLabel(worldName(meta.i18n), meta),
  );

  return `<carnap-world${exerciseRootAttributes(meta)}>
        <template shadowrootmode="open">
          <style>${WORLD_SHADOW_STYLES}</style>
          <fieldset aria-busy="true" class="exercise-group world" data-variant="${publicData.variant}">
            ${legend}
            <slot name="prompt"></slot>
            <div class="world-body" data-role="body">${exerciseBodyHtml(publicData, resolved, words, { disabled: true, headingLevel: exerciseSubheadingLevel(meta.heading.level), reveal: false })}</div>
            <slot name="exercise-actions"></slot>
          </fieldset>
        </template>
        <div class="exercise-prompt" slot="prompt">${publicData.promptHtml}</div>
        ${actions}
      </carnap-world>`;
}

export interface WorldReview {
  readonly answer: WorldAnswerData;
  readonly exerciseId: string;
  readonly verdict: WorldVerdict;
}

/**
 * The submitted answer, drawn statically for the review and results pages:
 * the world as the student left it (or their marks, or their sentence), with
 * the verdict above it. `reveal` is what a sealed exercise turns off: the
 * work stays, the verdict and the truth values go.
 */
export function renderWorldReview(
  publicData: WorldPublicData,
  review: WorldReview,
  i18n: Translator,
  reveal = true,
): string {
  const resolved = resolveWorld(publicData);
  const words = stringsResolver(buildWorldStrings(i18n));
  const verdict =
    resolved === null || !reveal
      ? ""
      : describeWorldVerdict(review.verdict, resolved, words);

  return `<carnap-world data-exercise-id="${escapeHtml(review.exerciseId)}" data-review>
        <template shadowrootmode="open">
          <style>${WORLD_REVIEW_STYLES}</style>
          ${verdict.length === 0 ? "" : `<p class="world-review-verdict">${escapeHtml(verdict)}</p>`}
          <div class="world world-review" data-variant="${publicData.variant}">${exerciseBodyHtml(
            publicData,
            resolved,
            words,
            // A review sits in the review page's outline, not a lesson's, so
            // its panels keep the rank they have always had there.
            {
              answer: review.answer,
              disabled: true,
              headingLevel: 3,
              reveal,
            },
          )}</div>
        </template>
      </carnap-world>`;
}

export function renderWorld(
  node: Extract<ContentNode, { readonly kind: "exercise" }>,
  context: ExerciseRenderContext,
): string {
  if (
    node.exerciseKind !== WORLD_KIND ||
    !isWorldPublicData(node.publicData)
  ) {
    return `<div data-component="${escapeHtml(node.render.component)}" data-exercise-id="${escapeHtml(node.exerciseId)}"></div>`;
  }

  return renderWorldElement(
    node.publicData,
    {
      component: node.render.component,
      componentVersion: node.render.componentVersion,
      contentRevisionId: context.contentRevisionId,
      exerciseId: node.exerciseId,
      exerciseKind: node.exerciseKind,
      i18n: context.i18n,
      heading: context.heading,
      title: context.title ?? null,
    },
    context.actions ?? previewExerciseActionsHtml(context.i18n, true),
  );
}
