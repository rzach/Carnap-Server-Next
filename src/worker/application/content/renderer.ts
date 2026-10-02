import type {
  CompiledContentArtifact,
  ComponentRegistryMetadata,
} from "../../domain/content";
import type {
  ExerciseHeading,
  ExerciseHeadingLevel,
} from "../../exercise-kit/group";
import {
  EXERCISE_HYDRATION_VERSION,
  type ExerciseHydration,
} from "../../exercise-kit/hydration";
import { keyedPublicData } from "../../exercise-kit/systems/join";
import type { Translator } from "../../i18n/translator";
import type { ExerciseRegistry } from "./registry";
import { createDefaultExerciseRegistry } from "./registry";
import { renderTheoryPanel } from "./theory-panel";

export interface RenderCompiledContentOptions {
  readonly contentRevisionId?: string;
}

export function renderCompiledContent(
  artifact: CompiledContentArtifact,
  i18n: Translator,
  registry: ExerciseRegistry = createDefaultExerciseRegistry(),
  options: RenderCompiledContentOptions = {},
): string {
  // The titles live in the manifest, not on the nodes: `exerciseTitle` is
  // authoring metadata the compiler files alongside the points and the answer
  // key, so a renderer that only walks the document cannot see it.
  const titles = new Map(
    artifact.manifest.map((item) => [item.id, item.title ?? null]),
  );
  const outline = exerciseOutline();

  return artifact.document.nodes
    .map((node) => {
      if (node.kind === "markdown") {
        outline.read(node.html);
        return node.html;
      }

      if (node.kind === "theory") {
        return renderTheoryPanel(node, i18n);
      }

      return registry.renderExercise(node, {
        ...(options.contentRevisionId === undefined
          ? {}
          : { contentRevisionId: options.contentRevisionId }),
        heading: outline.next(),
        i18n,
        title: titles.get(node.exerciseId) ?? null,
      });
    })
    .join("\n");
}

/** An opening heading tag in rendered Markdown, with its rank and attributes. */
const HEADING_TAG = /<h([1-6])\b([^>]*)>/g;

/**
 * The document's exercises in order, as headings: walked alongside the nodes,
 * `read` takes each Markdown node's HTML and `next` hands each exercise its
 * place.
 *
 * Its rank is one below the last heading the author wrote above it, so that
 * an exercise under "## Conditionals" is an h3 and is read as part of that
 * section; an h2 where the author wrote none, below the page's own title.
 * Capped at h6, where an exercise is a sibling of the heading above it rather
 * than its child. Its number counts every exercise, titled or not, from 1.
 *
 * Read off the rendered Markdown when the page is drawn rather than fixed when
 * the lesson is saved, so that revisions saved before exercises had headings
 * get them too. The sanitizer has escaped anything an author typed, so a tag
 * here is a heading the Markdown made. A heading hidden from sight is the
 * footnotes section's, which closes the notes rather than opening a section,
 * and is passed over.
 */
export function exerciseOutline(): {
  readonly next: () => ExerciseHeading;
  readonly read: (html: string) => void;
} {
  let above = 1;
  let count = 0;

  return {
    next: () => {
      count += 1;
      return {
        level: Math.min(above + 1, 6) as ExerciseHeadingLevel,
        number: count,
      };
    },
    read: (html) => {
      for (const [, rank, attributes] of html.matchAll(HEADING_TAG)) {
        if (!attributes?.includes("visually-hidden")) {
          above = Number(rank);
        }
      }
    },
  };
}

/**
 * The client bundles a document needs: one asset id per exercise type used,
 * skipping the types that ship no client module (see
 * {@link ComponentRegistryMetadata.clientModule}) and any whose asset id no
 * renderer claims. Requesting a bundle that was never built would only 404 —
 * and a 404 body served as JSON is a module-load error in the console.
 */
export function componentAssetsForArtifact(
  artifact: CompiledContentArtifact,
  registry: ExerciseRegistry = createDefaultExerciseRegistry(),
): string[] {
  return [
    ...new Set(
      artifact.document.nodes
        .filter((node) => node.kind === "exercise")
        .filter(
          (node) => registry.metadataFor(node.render)?.clientModule === true,
        )
        .map((node) => node.render.assetId),
    ),
  ];
}

/**
 * The document-scoped hydration table for a preview: every exercise's public
 * render data, keyed by exercise id. The sibling of
 * {@link componentAssetsForArtifact} — that says which bundles a document needs,
 * this says what to hand each element once they load.
 *
 * The interactive path has no use for it: each submission form embeds its own
 * payload (with the student's prior answer), and that per-element payload wins.
 * A preview has no forms, so without this table an element upgrades with
 * `publicData === null` and leaves the inert server markup standing.
 *
 * Mode is `answer` because the widget is genuinely in its answering state — it
 * is fully interactive, just unsubmittable: there is no form to mirror into and
 * no submit button, so an author can work the exercise without recording
 * anything.
 *
 * `feedback` comes off the manifest, which is why the manifest is walked at all
 * — a document node carries the author's public render data but not the
 * declaration the setting lives on. Without it every previewed widget behaved as
 * `full`, so an author who wrote `feedback="none"` was offered a Check button
 * and a green tick by the very page they were checking the setting on. It is the
 * authored value rather than one resolved against an assignment: a preview is
 * outside any assignment, and a release date that has not arrived is not
 * withholding anything from the author of the exercise.
 */
export function exerciseHydrationForArtifact(
  artifact: CompiledContentArtifact,
  i18n: Translator,
  registry: ExerciseRegistry = createDefaultExerciseRegistry(),
): Record<string, ExerciseHydration> {
  const table: Record<string, ExerciseHydration> = {};
  // The setting alone, not the manifest entry it came off. This function builds
  // a payload that goes to the browser, and a manifest entry carries the answer
  // key in `privateData` — so the one thing the lookup is for is the only thing
  // it holds.
  const authored = new Map(
    artifact.manifest.map((item) => [item.id, item.feedback]),
  );

  for (const node of artifact.document.nodes) {
    if (node.kind !== "exercise") {
      continue;
    }

    const feedback = authored.get(node.exerciseId);

    table[node.exerciseId] = {
      mode: "answer",
      options: feedback === undefined ? {} : { feedback },
      priorAnswer: null,
      // The name of the system, not its text: the document carries one copy
      // beside this table and the element joins the two. Same reason as
      // `exerciseHydrationScript`, which does it for the interactive path.
      publicData: keyedPublicData(node.publicData),
      strings: registry.strings(node.render.assetId, i18n),
      version: EXERCISE_HYDRATION_VERSION,
    };
  }

  return table;
}
