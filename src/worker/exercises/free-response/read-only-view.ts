import {
  escapeHtml,
  exerciseRootAttributes,
} from "../../application/content/render-support";
import type { ContentNode } from "../../domain/content";
import { previewExerciseActionsHtml } from "../../exercise-kit/actions";
import { recordedText } from "../../exercise-kit/assessment";
import {
  exerciseGroupDescription,
  exerciseGroupLabel,
  exerciseLegendHtml,
} from "../../exercise-kit/group";
import type { ExerciseRenderContext } from "../../exercise-kit/type";
import {
  FREE_RESPONSE_KIND,
  freeResponseInstructions,
  freeResponseName,
  isFreeResponsePublicData,
} from "./types";

/**
 * A textarea's content, escaped. The HTML parser drops one newline directly
 * after `<textarea>`, so an answer that opens with a blank line gets a spare
 * one to lose rather than losing its own.
 */
function textareaBody(text: string): string {
  return escapeHtml(text.startsWith("\n") ? `\n${text}` : text);
}

export function renderFreeResponse(
  node: Extract<ContentNode, { readonly kind: "exercise" }>,
  context: ExerciseRenderContext,
): string {
  if (
    node.exerciseKind !== FREE_RESPONSE_KIND ||
    !isFreeResponsePublicData(node.publicData)
  ) {
    return `<div data-component="${escapeHtml(node.render.component)}" data-exercise-id="${escapeHtml(node.exerciseId)}"></div>`;
  }

  const rootAttributes = exerciseRootAttributes({
    component: node.render.component,
    componentVersion: node.render.componentVersion,
    contentRevisionId: context.contentRevisionId,
    exerciseId: node.exerciseId,
    exerciseKind: node.exerciseKind,
  });
  // Spelled as a local named `i18n` because Lingui's extractor matches the
  // receiver's *name*; `context.i18n.t("Answer")` would render fine in English
  // and never reach a catalog.
  const i18n = context.i18n;
  const legend = exerciseLegendHtml(
    exerciseGroupLabel(freeResponseName(i18n), context),
  );
  // Unique per document, and safe as an id: `EXERCISE_ID_PATTERN` admits
  // anything HTML admits as an id, which is what `for` matches against —
  // exactly, with no escaping — and refuses the whitespace that would keep the
  // two from ever pairing. Associated by `for`/`id` rather than by nesting, so
  // the label and the control are siblings the layout can place independently
  // — and so the field's accessible name never depends on what else the label
  // wraps.
  const fieldId = `${node.exerciseId}-answer`;
  // The group's description: the prompt, or the instruction when there is
  // none. In the light DOM the id is the page's, so it is the exercise's own.
  const promptHtml = node.publicData.promptHtml;
  const description = exerciseGroupDescription(
    promptHtml.trim() === ""
      ? null
      : `<div class="exercise-prompt">${promptHtml}</div>`,
    freeResponseInstructions(i18n).answer,
    `${node.exerciseId}-description`,
  );
  // With an action bar this is a student's form, and the field is the answer
  // the runtime reads (`name="text"`, the one native field it knows). Without
  // one it is a preview or a saved revision, and the field is inert: there is
  // no attempt behind it to record an answer against. Either way the closing
  // row sits unslotted — a text exercise has no shadow card to project into.
  // The field holds the viewer's recorded answer, if any: with no element to
  // hydrate, this is the only way a reload gets their text back.
  const field = context.actions === undefined ? " disabled" : ' name="text"';
  return `<section${rootAttributes}>
        <fieldset class="exercise-group"${description.describedBy}>
          ${legend}
          ${description.html}
          <label for="${escapeHtml(fieldId)}">${escapeHtml(i18n.t("Answer"))}</label>
          <textarea${field} id="${escapeHtml(fieldId)}" rows="8">${textareaBody(recordedText(context.priorAnswer))}</textarea>
        </fieldset>
        ${context.actions ?? previewExerciseActionsHtml(i18n, false)}
      </section>`;
}
