import type {
  AnswerEnvelope,
  AnswerNormalizationResult,
  AutomaticEvaluation,
  EvaluationContext,
  ExerciseAnswerReview,
  ExerciseManifestItem,
  ExerciseReviewContext,
  NormalizedAnswer,
} from "../../domain/content";
import type { JsonValue } from "../../domain/json";
import { diagnostic, isObject } from "../../exercise-kit/assessment";
import type { ExerciseAssessment } from "../../exercise-kit/type";
import { stringsResolver } from "../../i18n/translator";
import {
  answerForVariant,
  isWorldAnswerData,
  isWorldPublicData,
  resolveWorld,
} from "./grading";
import { judgeWorld, verdictScore } from "./logic/check";
import { renderWorldReview } from "./read-only-view";
import { buildWorldStrings } from "./strings";
import type { WorldAnswerData } from "./types";
import { WORLD_ANSWER_KIND, WORLD_SCHEMA_VERSION, worldName } from "./types";
import { describeWorldVerdict } from "./verdict-text";

const WORLD_EVALUATOR_VERSION = "world-evaluator@1";

function worldAnswerData(answer: NormalizedAnswer): WorldAnswerData {
  return answer.data as unknown as WorldAnswerData;
}

export const WORLD_ASSESSMENT = {
  normalizeAnswer(
    envelope: AnswerEnvelope,
    declaration: ExerciseManifestItem,
  ): AnswerNormalizationResult {
    if (envelope.kind !== WORLD_ANSWER_KIND) {
      return {
        diagnostics: [
          diagnostic(
            "wrong_answer_kind",
            `Expected answer kind ${WORLD_ANSWER_KIND}.`,
            ["kind"],
          ),
        ],
        ok: false,
        reason: "wrong-kind",
      };
    }

    if (envelope.schemaVersion !== WORLD_SCHEMA_VERSION) {
      return {
        diagnostics: [
          diagnostic(
            "unsupported_answer_schema_version",
            "The answer schema version is not supported.",
            ["schemaVersion"],
          ),
        ],
        ok: false,
        reason: "schema-invalid",
      };
    }

    if (!isObject(envelope.data) || !isWorldAnswerData(envelope.data)) {
      return {
        diagnostics: [
          diagnostic(
            "malformed_answer_data",
            "A world answer is a list of marks, a list of games, a world, or a sentence.",
            ["data"],
          ),
        ],
        ok: false,
        reason: "malformed",
      };
    }

    if (!isWorldPublicData(declaration.publicData)) {
      return {
        diagnostics: [
          diagnostic(
            "answer_shape_mismatch",
            "The submitted answer does not match the exercise's shape.",
            ["data"],
          ),
        ],
        ok: false,
        reason: "schema-invalid",
      };
    }

    // A world that breaks the physics, a pin, or the budget is a valid wrong
    // answer, scored zero with the reason: only JSON of the wrong shape is
    // refused here. The world itself is kept as it came, so review shows what
    // was submitted, and grading reads it through the kind's own parser.
    return {
      answer: {
        data: answerForVariant(
          declaration.publicData,
          envelope.data,
        ) as unknown as JsonValue,
        kind: WORLD_ANSWER_KIND,
        schemaVersion: WORLD_SCHEMA_VERSION,
      },
      ok: true,
    };
  },

  async evaluate(
    answer: NormalizedAnswer,
    declaration: ExerciseManifestItem,
    _context: EvaluationContext,
  ): Promise<AutomaticEvaluation> {
    const base = {
      declarationHash: declaration.declarationHash,
      evaluatorVersion: WORLD_EVALUATOR_VERSION,
      kind: "automatic" as const,
      nominalMaxScore: declaration.nominalPoints,
    };

    if (!isWorldPublicData(declaration.publicData)) {
      return {
        ...base,
        awardedScore: 0,
        feedback: {
          diagnostics: [{ code: "invalid_declaration_public_data" }],
        },
        status: "error",
      };
    }

    const resolved = resolveWorld(declaration.publicData);

    if (resolved === null) {
      return { ...base, awardedScore: 0, status: "error" };
    }

    const verdict = judgeWorld(
      declaration.publicData,
      resolved,
      answerForVariant(declaration.publicData, worldAnswerData(answer)),
    );
    const fraction = verdictScore(verdict);

    // Evaluate and game are scored per sentence; the other three either do
    // what was asked or do not.
    return {
      ...base,
      awardedScore: declaration.nominalPoints * fraction,
      status: verdict.ok ? "correct" : "incorrect",
    };
  },

  reviewAnswer(
    answer: NormalizedAnswer,
    declaration: ExerciseManifestItem,
    context: ExerciseReviewContext,
  ): ExerciseAnswerReview {
    const i18n = context.i18n;

    if (!isWorldPublicData(declaration.publicData)) {
      return { summary: worldName(i18n) };
    }

    const resolved = resolveWorld(declaration.publicData);

    if (resolved === null) {
      return { summary: worldName(i18n) };
    }

    const data = answerForVariant(
      declaration.publicData,
      worldAnswerData(answer),
    );
    const verdict = judgeWorld(declaration.publicData, resolved, data);
    const strings = stringsResolver(buildWorldStrings(i18n));
    // There is no answer key — every truth value follows from public data —
    // so the review recomputes, and sealing the evaluation alone would leave
    // the verdict on the page.
    const reveal = context.revealCorrectness !== false;
    const summary = describeWorldVerdict(verdict, resolved, strings);

    return {
      ...(reveal
        ? { details: [{ label: i18n.t("Result"), value: summary }] }
        : {}),
      elementHtml: renderWorldReview(
        declaration.publicData,
        { answer: data, exerciseId: declaration.id, verdict },
        i18n,
        reveal,
      ),
      summary: reveal ? summary : worldName(i18n),
    };
  },
} satisfies ExerciseAssessment;
