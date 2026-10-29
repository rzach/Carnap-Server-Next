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
  exerciseGroupDescription,
  exerciseGroupLabel,
  exerciseLegendHtml,
  promptSlot,
} from "../../exercise-kit/group";
import { reviewHydrationScript } from "../../exercise-kit/hydration";
import { EXERCISE_TOKEN_STYLES } from "../../exercise-kit/tokens";
import type { ExerciseRenderContext } from "../../exercise-kit/type";
import type { Translator } from "../../i18n/translator";
import { stringsResolver } from "../../i18n/translator";
import type {
  DrawnNode,
  SentenceRun,
  ShownAnswers,
  SyntaxTreeWords,
} from "./display";
import { drawnTree, RUN_CLASS, shownAnswers } from "./display";
import type { ResolvedSyntaxTree, SyntaxTreeVerdict } from "./grading";
import { isSyntaxTreePublicData, resolveSyntaxTree } from "./grading";
import type { SyntaxTreeDepth } from "./logic/tree";
import shadowStyles from "./shadow.css" with { type: "text" };
import { buildSyntaxTreeStrings } from "./strings";
import type { SyntaxTreeAnswerData, SyntaxTreePublicData } from "./types";
import {
  SYNTAX_TREE_COMPONENT_METADATA,
  SYNTAX_TREE_KIND,
  syntaxTreeInstructions,
  syntaxTreeName,
} from "./types";
import { SYNTAX_TREE_DEPTH_WORDS } from "./words";

/**
 * The element's module, which the review loads too: the tree's lines are
 * SVG measured from the laid-out nodes, so only the element can draw them.
 */
const SYNTAX_TREE_ASSET_URL = `/assets/components/${SYNTAX_TREE_COMPONENT_METADATA.assetId}.js`;

const SYNTAX_TREE_SHADOW_STYLES = [
  EXERCISE_GROUP_SHADOW_STYLES,
  shadowStyles,
].join("\n");
const SYNTAX_TREE_REVIEW_STYLES = [
  EXERCISE_TOKEN_STYLES,
  VISUALLY_HIDDEN_STYLES,
  shadowStyles,
].join("\n");

function labelHtml(label: string | null): string {
  return label === null ? "" : ` aria-label="${escapeHtml(label)}"`;
}

function runHtml(run: SentenceRun): string {
  const text = escapeHtml(run.text);

  switch (run.kind) {
    case "mark":
      return text;
    case "binder":
      return `<button class="${RUN_CLASS.binder}" data-main data-node="${escapeHtml(run.node)}" type="button"${labelHtml(run.label)} disabled>${text}</button>`;
    case "connective":
      return `<button class="${RUN_CLASS.connective}" data-node="${escapeHtml(run.node)}" type="button"${labelHtml(run.label)} disabled>${text}</button>`;
    case "variable":
      return `<button aria-pressed="${run.pressed}" class="${RUN_CLASS.variable}" data-node="${escapeHtml(run.node)}" type="button"${labelHtml(run.label)} disabled>${text}</button>`;
    case "main":
      return `<span class="${RUN_CLASS.main}" data-main>${text}</span>`;
    default:
      return `<span class="${RUN_CLASS[run.kind]}">${text}</span>`;
  }
}

/**
 * A linked variable's words: shown when it is free, and for a screen reader
 * only when bound, since the line drawn to its quantifier shows the rest.
 */
function linkNoteHtml(node: DrawnNode): string {
  if (node.link === null) {
    return "";
  }

  const hidden = node.link.boundBy === null ? "" : " visually-hidden";

  return `<span class="st-link-note${hidden}">${escapeHtml(node.link.note)}</span>`;
}

function nodeHtml(node: DrawnNode): string {
  const children =
    node.state === "split"
      ? `<ul class="st-children">${node.children.map(nodeHtml).join("")}</ul>`
      : "";
  const boundBy =
    node.link?.boundBy == null
      ? ""
      : ` data-bound-by="${escapeHtml(node.link.boundBy)}"`;

  return `<li class="st-node"${boundBy} data-path="${escapeHtml(node.key)}" data-state="${node.state}"><div class="st-sentence">${node.runs.map(runHtml).join("")}</div>${linkNoteHtml(node)}${children}</li>`;
}

/**
 * The tree as far as `shown` has split and linked it, inert: the element
 * enables its buttons and draws its lines, and a review only draws.
 */
function treeHtml(
  resolved: ResolvedSyntaxTree | null,
  shown: ShownAnswers,
  words: SyntaxTreeWords,
): string {
  return resolved === null
    ? ""
    : `<div class="st-scroll"><ul class="st-tree">${nodeHtml(drawnTree(resolved, shown, words))}</ul></div>`;
}

const NOTHING_SHOWN: ShownAnswers = {
  links: new Map(),
  missed: new Map(),
  split: new Set(),
};

/** The count a verdict comes to, in words. */
export function describeSyntaxTreeVerdict(
  verdict: SyntaxTreeVerdict,
  depth: SyntaxTreeDepth,
  words: SyntaxTreeWords,
): string {
  const depthWords = SYNTAX_TREE_DEPTH_WORDS[depth];

  if (verdict.ok) {
    return words(depthWords.allRight);
  }

  return verdict.picked < verdict.total && verdict.right === verdict.picked
    ? words("The tree is not finished.")
    : words(depthWords.count, {
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
  // Free is shown only while a variable is being linked, beside the sentence
  // that asks for the link. The instructions are in the element's (?) panel.
  const free =
    publicData.depth === "terms"
      ? `<button class="st-free" data-role="free" hidden type="button">${escapeHtml(words("Free"))}</button>`
      : "";

  const description = exerciseGroupDescription(
    promptSlot(publicData.promptHtml),
    syntaxTreeInstructions(meta.i18n)[publicData.depth],
  );

  return `<carnap-syntax-tree${exerciseRootAttributes(meta)}>
        <template shadowrootmode="open">
          <style>${SYNTAX_TREE_SHADOW_STYLES}</style>
          <fieldset aria-busy="true" class="exercise-group syntax-tree" data-scoring="${publicData.scoring}"${description.describedBy}>
            ${legend}
            ${description.html}
            <div class="syntax-tree-body" data-role="body">
              <div data-role="tree">${treeHtml(resolved, NOTHING_SHOWN, words)}</div>
              <div class="st-status"><p aria-live="polite" class="st-message" data-role="message" tabindex="-1"></p>${free}</div>
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
      : describeSyntaxTreeVerdict(review.verdict, publicData.depth, words);
  const shown =
    resolved === null
      ? NOTHING_SHOWN
      : shownAnswers(resolved, publicData, review.answer.picks);

  // The hydration payload says `review`, so the element only draws the lines
  // over the tree drawn here.
  return `<carnap-syntax-tree data-exercise-id="${escapeHtml(review.exerciseId)}" data-review>
        <template shadowrootmode="open">
          <style>${SYNTAX_TREE_REVIEW_STYLES}</style>
          ${verdict.length === 0 ? "" : `<p class="syntax-tree-review-verdict">${escapeHtml(verdict)}</p>`}
          <div class="syntax-tree syntax-tree-review" data-role="tree">${treeHtml(resolved, shown, words)}</div>
        </template>
        ${reviewHydrationScript(buildSyntaxTreeStrings(i18n))}
      </carnap-syntax-tree><script type="module" src="${SYNTAX_TREE_ASSET_URL}"></script>`;
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
