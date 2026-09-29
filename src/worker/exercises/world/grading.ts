/**
 * Stored exercise data turned back into something the checks can judge: the
 * language, the world kind and its bound vocabulary, the parsed sentences and
 * laws, and the worlds.
 *
 * Nothing here is stored twice: the vocabulary binding follows from the
 * language and the kind, and the parse is a handful of sentences. DOM-free
 * and free of i18n, because the client element resolves the same public data
 * for its live truth values and its Check.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import type { Formula } from "../../exercise-kit/formula";
import {
  firstOrderLanguageFor,
  formulaToString,
  parseEngineFormula,
} from "../../exercise-kit/formula";
import { worldKindById } from "./kinds";
import type { WorldKind } from "./kinds/contract";
import { isWorldGameAnswer } from "./logic/game";
import type { WorldVocabulary } from "./logic/structure";
import { bindVocabulary } from "./logic/structure";
import type {
  WorldAnswerData,
  WorldPublicData,
  WorldSentence,
  WorldVariant,
} from "./types";
import { WORLD_VARIANTS } from "./types";

/** A stored sentence read back, with the text a reader is shown. */
export interface ResolvedSentence {
  readonly formula: Formula;
  readonly target?: boolean;
  readonly text: string;
}

export interface ResolvedWorld {
  readonly kind: WorldKind;
  readonly language: SurfaceLanguage;
  readonly laws: readonly ResolvedSentence[];
  readonly pinned: ReadonlySet<string>;
  readonly sentences: readonly ResolvedSentence[];
  /** The start world, or an empty one for distinguish. */
  readonly start: unknown;
  readonly vocabulary: WorldVocabulary;
  /** A distinguish exercise's two worlds. */
  readonly worlds: { readonly a: unknown; readonly b: unknown } | null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isSentence(value: unknown): value is WorldSentence {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const sentence = value as Partial<WorldSentence>;

  return (
    typeof sentence.engine === "string" &&
    (sentence.target === undefined || typeof sentence.target === "boolean")
  );
}

export function isWorldPublicData(value: unknown): value is WorldPublicData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Partial<WorldPublicData>;

  return (
    typeof data.world === "string" &&
    WORLD_VARIANTS.includes(data.variant as WorldVariant) &&
    typeof data.promptHtml === "string" &&
    typeof data.system === "string" &&
    Array.isArray(data.sentences) &&
    data.sentences.every(isSentence) &&
    isStringArray(data.laws) &&
    isStringArray(data.pinned) &&
    (data.budget === undefined || typeof data.budget === "number")
  );
}

/** The answer's shape; which fields matter is the declaration's business. */
export function isWorldAnswerData(value: unknown): value is WorldAnswerData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    (data.games === undefined ||
      (Array.isArray(data.games) &&
        data.games.every(
          (entry) => entry === null || isWorldGameAnswer(entry),
        ))) &&
    (data.sentence === undefined || typeof data.sentence === "string") &&
    (data.values === undefined ||
      (Array.isArray(data.values) &&
        data.values.every(
          (entry) => entry === null || typeof entry === "boolean",
        )))
  );
}

/**
 * Parse the stored sentences and worlds and bind the vocabulary.
 *
 * `null` when the stored data no longer resolves — an unknown kind, a
 * language that does not read, a sentence that will not parse, a world that is
 * not the kind's shape. None can happen for data this compiler wrote; each is
 * how a revision from a future version fails safely.
 */
export function resolveWorld(
  publicData: WorldPublicData,
): ResolvedWorld | null {
  const kind = worldKindById(publicData.world);
  const language = firstOrderLanguageFor(publicData);

  if (kind === null || language === null) {
    return null;
  }

  const parseAll = (
    sources: readonly WorldSentence[],
  ): ResolvedSentence[] | null => {
    const parsed: ResolvedSentence[] = [];

    for (const { engine, ...sentence } of sources) {
      const result = parseEngineFormula(engine, language);

      if (!result.ok) {
        return null;
      }

      parsed.push({
        ...sentence,
        formula: result.formula,
        text: formulaToString(result.formula, language),
      });
    }

    return parsed;
  };

  const sentences = parseAll(publicData.sentences);
  const laws = parseAll(
    publicData.laws.map((engine) => ({ engine, target: true })),
  );

  if (sentences === null || laws === null) {
    return null;
  }

  let worlds: ResolvedWorld["worlds"] = null;
  let start: unknown = kind.empty();

  if (publicData.variant === "distinguish") {
    const a = kind.parseState(publicData.worlds?.a);
    const b = kind.parseState(publicData.worlds?.b);

    if (a === null || b === null) {
      return null;
    }

    worlds = { a, b };
  } else {
    const parsed = kind.parseState(publicData.start);

    if (parsed === null) {
      return null;
    }

    start = parsed;
  }

  return {
    kind,
    language,
    laws,
    pinned: new Set(publicData.pinned),
    sentences,
    start,
    vocabulary: bindVocabulary(kind, language),
    worlds,
  };
}

/**
 * The answer with only the field the variant reads, in the form grading
 * wants: an evaluate or game answer padded or cut to one entry per sentence,
 * and a world or sentence passed through as it came.
 */
export function answerForVariant(
  publicData: WorldPublicData,
  answer: WorldAnswerData,
): WorldAnswerData {
  switch (publicData.variant) {
    case "evaluate":
      return {
        values: publicData.sentences.map(
          (_, index) => answer.values?.[index] ?? null,
        ),
      };
    case "game":
      return {
        games: publicData.sentences.map(
          (_, index) => answer.games?.[index] ?? null,
        ),
      };
    case "distinguish":
      return { sentence: answer.sentence ?? "" };
    default:
      return answer.world === undefined ? {} : { world: answer.world };
  }
}
