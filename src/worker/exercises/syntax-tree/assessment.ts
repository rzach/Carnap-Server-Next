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
import { diagnostic } from "../../exercise-kit/assessment";
import type { ExerciseAssessment } from "../../exercise-kit/type";
import { stringsResolver } from "../../i18n/translator";
import {
  isSyntaxTreeAnswerData,
  isSyntaxTreePublicData,
  judgeSyntaxTree,
  resolveSyntaxTree,
  verdictScore,
} from "./grading";
import {
  describeSyntaxTreeVerdict,
  renderSyntaxTreeReview,
} from "./read-only-view";
import { buildSyntaxTreeStrings } from "./strings";
import type { SyntaxTreeAnswerData } from "./types";
import {
  SYNTAX_TREE_ANSWER_KIND,
  SYNTAX_TREE_SCHEMA_VERSION,
  syntaxTreeName,
} from "./types";

const SYNTAX_TREE_EVALUATOR_VERSION = "syntax-tree-evaluator@1";

function syntaxTreeAnswerData(
  answer: NormalizedAnswer,
): SyntaxTreeAnswerData {
  return answer.data as unknown as SyntaxTreeAnswerData;
}

export const SYNTAX_TREE_ASSESSMENT = {
  normalizeAnswer(
    envelope: AnswerEnvelope,
    declaration: ExerciseManifestItem,
  ): AnswerNormalizationResult {
    if (envelope.kind !== SYNTAX_TREE_ANSWER_KIND) {
      return {
        diagnostics: [
          diagnostic(
            "wrong_answer_kind",
            `Expected answer kind ${SYNTAX_TREE_ANSWER_KIND}.`,
            ["kind"],
          ),
        ],
        ok: false,
        reason: "wrong-kind",
      };
    }

    if (envelope.schemaVersion !== SYNTAX_TREE_SCHEMA_VERSION) {
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

    if (!isSyntaxTreeAnswerData(envelope.data)) {
      return {
        diagnostics: [
          diagnostic(
            "malformed_answer_data",
            "A syntax tree answer is a list of picks, each a node and the connective clicked or named there.",
            ["data"],
          ),
        ],
        ok: false,
        reason: "malformed",
      };
    }

    if (!isSyntaxTreePublicData(declaration.publicData)) {
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

    // A pick at a node the tree does not have, or a second pick at one, is
    // kept as it came and simply not counted: only JSON of the wrong shape is
    // refused, so review shows what was sent.
    return {
      answer: {
        data: {
          picks: envelope.data.picks,
        } as unknown as JsonValue,
        kind: SYNTAX_TREE_ANSWER_KIND,
        schemaVersion: SYNTAX_TREE_SCHEMA_VERSION,
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
      evaluatorVersion: SYNTAX_TREE_EVALUATOR_VERSION,
      kind: "automatic" as const,
      nominalMaxScore: declaration.nominalPoints,
    };

    if (!isSyntaxTreePublicData(declaration.publicData)) {
      return {
        ...base,
        awardedScore: 0,
        feedback: {
          diagnostics: [{ code: "invalid_declaration_public_data" }],
        },
        status: "error",
      };
    }

    const resolved = resolveSyntaxTree(declaration.publicData);

    if (resolved === null) {
      return { ...base, awardedScore: 0, status: "error" };
    }

    const verdict = judgeSyntaxTree(
      resolved.tree,
      syntaxTreeAnswerData(answer).picks,
    );

    return {
      ...base,
      awardedScore:
        declaration.nominalPoints *
        verdictScore(verdict, declaration.publicData.scoring),
      status: verdict.ok ? "correct" : "incorrect",
    };
  },

  reviewAnswer(
    answer: NormalizedAnswer,
    declaration: ExerciseManifestItem,
    context: ExerciseReviewContext,
  ): ExerciseAnswerReview {
    const i18n = context.i18n;

    if (!isSyntaxTreePublicData(declaration.publicData)) {
      return { summary: syntaxTreeName(i18n) };
    }

    const resolved = resolveSyntaxTree(declaration.publicData);

    if (resolved === null) {
      return { summary: syntaxTreeName(i18n) };
    }

    const data = syntaxTreeAnswerData(answer);
    const verdict = judgeSyntaxTree(resolved.tree, data.picks);
    const words = stringsResolver(buildSyntaxTreeStrings(i18n));
    // There is no answer key — the tree follows from the public sentence — so
    // the review recomputes, and sealing the evaluation alone would leave the
    // verdict on the page.
    const reveal = context.revealCorrectness !== false;
    const summary = describeSyntaxTreeVerdict(verdict, words);

    return {
      ...(reveal
        ? { details: [{ label: i18n.t("Result"), value: summary }] }
        : {}),
      elementHtml: renderSyntaxTreeReview(
        declaration.publicData,
        { answer: data, exerciseId: declaration.id, verdict },
        i18n,
        reveal,
      ),
      summary: reveal ? summary : syntaxTreeName(i18n),
    };
  },
} satisfies ExerciseAssessment;
