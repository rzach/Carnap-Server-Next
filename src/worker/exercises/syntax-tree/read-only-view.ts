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
  exerciseGroupLabel,
  exerciseLegendHtml,
} from "../../exercise-kit/group";
import { EXERCISE_TOKEN_STYLES } from "../../exercise-kit/tokens";
import type { ExerciseRenderContext } from "../../exercise-kit/type";
import type { Translator } from "../../i18n/translator";
import { stringsResolver } from "../../i18n/translator";
import type { DrawnNode, SentenceRun, SyntaxTreeWords } from "./display";
import { drawnTree, RUN_CLASS, splitNodes } from "./display";
import type { ResolvedSyntaxTree, SyntaxTreeVerdict } from "./grading";
import { isSyntaxTreePublicData, resolveSyntaxTree } from "./grading";
import shadowStyles from "./shadow.css" with { type: "text" };
import { buildSyntaxTreeStrings } from "./strings";
import type { SyntaxTreeAnswerData, SyntaxTreePublicData } from "./types";
import { SYNTAX_TREE_KIND, syntaxTreeName } from "./types";

const SYNTAX_TREE_SHADOW_STYLES = [
  EXERCISE_GROUP_SHADOW_STYLES,
  shadowStyles,
].join("\n");
const SYNTAX_TREE_REVIEW_STYLES = [
  EXERCISE_TOKEN_STYLES,
  VISUALLY_HIDDEN_STYLES,
  shadowStyles,
].join("\n");

function runHtml(run: SentenceRun): string {
  const text = escapeHtml(run.text);

  switch (run.kind) {
    case "mark":
      return text;
    case "connective":
      return `<button class="${RUN_CLASS.connective}" data-node="${escapeHtml(run.node)}" type="button"${run.label === null ? "" : ` aria-label="${escapeHtml(run.label)}"`} disabled>${text}</button>`;
    case "main":
      return `<span class="${RUN_CLASS.main}" data-main>${text}</span>`;
    default:
      return `<span class="${RUN_CLASS[run.kind]}">${text}</span>`;
  }
}

function nodeHtml(node: DrawnNode): string {
  const children =
    node.state === "split"
      ? `<ul class="st-children">${node.children.map(nodeHtml).join("")}</ul>`
      : "";

  return `<li class="st-node" data-path="${escapeHtml(node.key)}" data-state="${node.state}"><div class="st-sentence">${node.runs.map(runHtml).join("")}</div>${children}</li>`;
}

/**
 * The tree as far as `split` has split it, inert: the element enables its
 * connectives, and a review never does.
 */
function treeHtml(
  resolved: ResolvedSyntaxTree | null,
  split: ReadonlySet<string>,
  words: SyntaxTreeWords,
): string {
  return resolved === null
    ? ""
    : `<div class="st-scroll"><ul class="st-tree">${nodeHtml(drawnTree(resolved, split, words))}</ul></div>`;
}

/** The count a verdict comes to, in words. */
export function describeSyntaxTreeVerdict(
  verdict: SyntaxTreeVerdict,
  words: SyntaxTreeWords,
): string {
  if (verdict.ok) {
    return words("Every connective picked correctly.");
  }

  return verdict.picked < verdict.total && verdict.right === verdict.picked
    ? words("The tree is not finished.")
    : words("Main connectives found: {right} of {total}", {
        right: String(verdict.right),
        total: String(verdict.total),
      });
}

interface SyntaxTreeElementMeta extends ExerciseElementMeta {
  readonly i18n: Translator;
  readonly heading: ExerciseHeading;
  readonly title: string | null;
}

/**
 * The syntax-tree element with its Declarative Shadow Root: the sentence,
 * inert (its connectives disabled, `aria-busy`) and readable with no JS. The
 * element enables the connectives and restores prior picks on connect.
 */
export function renderSyntaxTreeElement(
  publicData: SyntaxTreePublicData,
  meta: SyntaxTreeElementMeta,
  actions = "",
): string {
  const resolved = resolveSyntaxTree(publicData);
  const words = stringsResolver(buildSyntaxTreeStrings(meta.i18n));
  const legend = exerciseLegendHtml(
    exerciseGroupLabel(syntaxTreeName(meta.i18n), meta),
  );

  return `<carnap-syntax-tree${exerciseRootAttributes(meta)}>
        <template shadowrootmode="open">
          <style>${SYNTAX_TREE_SHADOW_STYLES}</style>
          <fieldset aria-busy="true" class="exercise-group syntax-tree" data-scoring="${publicData.scoring}">
            ${legend}
            <slot name="prompt"></slot>
            <div class="syntax-tree-body" data-role="body">
              <p class="st-instructions">${escapeHtml(words("Pick the main connective of each sentence until only atomic sentences remain."))}</p>
              <div data-role="tree">${treeHtml(resolved, new Set(), words)}</div>
              <div class="st-typed"><label for="st-typed">${escapeHtml(words("Main connective"))}</label><input autocomplete="off" data-role="typed" disabled id="st-typed" spellcheck="false" type="text"><button data-role="split" disabled type="button">${escapeHtml(words("Split"))}</button></div>
              <p aria-live="polite" class="st-message" data-role="message" tabindex="-1"></p>
            </div>
            <slot name="exercise-actions"></slot>
          </fieldset>
        </template>
        <div class="exercise-prompt" slot="prompt">${publicData.promptHtml}</div>
        ${actions}
      </carnap-syntax-tree>`;
}

export interface SyntaxTreeReview {
  readonly answer: SyntaxTreeAnswerData;
  readonly exerciseId: string;
  readonly verdict: SyntaxTreeVerdict;
}

/**
 * The submitted tree, drawn statically for the review and results pages, as
 * far as the student split it, with the verdict above it. `reveal` is what a
 * sealed exercise turns off: the tree stays, the verdict goes.
 */
export function renderSyntaxTreeReview(
  publicData: SyntaxTreePublicData,
  review: SyntaxTreeReview,
  i18n: Translator,
  reveal = true,
): string {
  const resolved = resolveSyntaxTree(publicData);
  const words = stringsResolver(buildSyntaxTreeStrings(i18n));
  const verdict =
    resolved === null || !reveal
      ? ""
      : describeSyntaxTreeVerdict(review.verdict, words);
  const split =
    resolved === null
      ? new Set<string>()
      : splitNodes(resolved, publicData, review.answer.picks);

  return `<carnap-syntax-tree data-exercise-id="${escapeHtml(review.exerciseId)}" data-review>
        <template shadowrootmode="open">
          <style>${SYNTAX_TREE_REVIEW_STYLES}</style>
          ${verdict.length === 0 ? "" : `<p class="syntax-tree-review-verdict">${escapeHtml(verdict)}</p>`}
          <div class="syntax-tree syntax-tree-review">${treeHtml(resolved, split, words)}</div>
        </template>
      </carnap-syntax-tree>`;
}

export function renderSyntaxTree(
  node: Extract<ContentNode, { readonly kind: "exercise" }>,
  context: ExerciseRenderContext,
): string {
  if (
    node.exerciseKind !== SYNTAX_TREE_KIND ||
    !isSyntaxTreePublicData(node.publicData)
  ) {
    return `<div data-component="${escapeHtml(node.render.component)}" data-exercise-id="${escapeHtml(node.exerciseId)}"></div>`;
  }

  return renderSyntaxTreeElement(
    node.publicData,
    {
      component: node.render.component,
      componentVersion: node.render.componentVersion,
      contentRevisionId: context.contentRevisionId,
      exerciseId: node.exerciseId,
      exerciseKind: node.exerciseKind,
      heading: context.heading,
      i18n: context.i18n,
      title: context.title ?? null,
    },
    context.actions ?? previewExerciseActionsHtml(context.i18n, true),
  );
}
