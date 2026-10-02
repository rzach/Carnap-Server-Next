import type {
  AnswerEnvelope,
  EvaluationContext,
  ExerciseAnswerReview,
  ExerciseManifestItem,
  ExerciseReviewContext,
  NormalizedAnswer,
} from "../../domain/content";
import type { ProofAnswerShape } from "../../exercise-kit/proof/assessment";
import {
  evaluateProofCertificate,
  MAX_PROOF_TEXT_LENGTH,
  normalizeProofAnswer,
} from "../../exercise-kit/proof/assessment";
import {
  proofRuleSpellings,
  proofTheoryText,
} from "../../exercise-kit/proof/formulas";
import { goalText, reviewGoalRow } from "../../exercise-kit/proof/goal-row";
import type { ExerciseAssessment } from "../../exercise-kit/type";
import { renderAufbauProofFitchReview } from "./read-only-view";
import type { AufbauProofFitchAnswerData } from "./types";
import {
  AUFBAU_PROOF_FITCH_ANSWER_KIND,
  AUFBAU_PROOF_FITCH_SCHEMA_VERSION,
  aufbauProofFitchName,
  DEFAULT_ASSUMPTION_RULE,
  isAufbauProofFitchAnswerData,
  isAufbauProofFitchPublicData,
} from "./types";

/** The Fitch text the student wrote is kept beside the `.auf` it translated
 *  to, under the same generous cap. */
const MAX_FITCH_TEXT_LENGTH = MAX_PROOF_TEXT_LENGTH;

const SHAPE: ProofAnswerShape<AufbauProofFitchAnswerData> = {
  answerKind: AUFBAU_PROOF_FITCH_ANSWER_KIND,
  evaluatorVersion: "aufbau-proof-fitch-verifier@1",
  isAnswerData: isAufbauProofFitchAnswerData,
  isPublicData: isAufbauProofFitchPublicData,
  needs:
    "A Fitch proof answer needs a base64 mmb, a proofText, and a fitchText.",
  own: (data) => ({
    fields: { fitchText: data.fitchText },
    withinCaps: data.fitchText.length <= MAX_FITCH_TEXT_LENGTH,
  }),
  schemaVersion: AUFBAU_PROOF_FITCH_SCHEMA_VERSION,
};

function fitchAnswerData(
  answer: NormalizedAnswer,
): AufbauProofFitchAnswerData {
  return answer.data as unknown as AufbauProofFitchAnswerData;
}

export const AUFBAU_PROOF_FITCH_ASSESSMENT = {
  normalizeAnswer(
    envelope: AnswerEnvelope,
    declaration: ExerciseManifestItem,
  ) {
    return normalizeProofAnswer(SHAPE, envelope, declaration);
  },

  evaluate(
    answer: NormalizedAnswer,
    declaration: ExerciseManifestItem,
    context: EvaluationContext,
  ) {
    return evaluateProofCertificate(SHAPE, answer, declaration, context);
  },

  reviewAnswer(
    answer: NormalizedAnswer,
    declaration: ExerciseManifestItem,
    context: ExerciseReviewContext,
  ): ExerciseAnswerReview {
    const data = fitchAnswerData(answer);
    const publicData = isAufbauProofFitchPublicData(declaration.publicData)
      ? declaration.publicData
      : null;
    // The goal in the terms the student was asked it: the statement the
    // theorem declares, not its name, which is the engine's handle on the goal
    // and free to differ from the exercise id beside it. A playground was
    // asked nothing; its goal is the one the answer derived.
    const goal =
      publicData === null
        ? null
        : reviewGoalRow(
            context.i18n,
            publicData,
            data.goal,
            proofTheoryText(publicData),
            goalText(proofTheoryText(publicData), publicData.goalName),
          );
    return {
      details: [
        {
          label: context.i18n.t("Goal"),
          value: goal?.statement ?? declaration.id,
        },
      ],
      elementHtml: renderAufbauProofFitchReview(
        {
          assumptionRule:
            publicData?.assumptionRule ?? DEFAULT_ASSUMPTION_RULE,
          assumptionSpellings:
            publicData === null
              ? []
              : proofRuleSpellings(
                  proofTheoryText(publicData).source,
                  publicData.assumptionRule,
                ),
          exerciseId: declaration.id,
          fitchText: data.fitchText,
          goal,
        },
        context.i18n,
      ),
      summary: aufbauProofFitchName(context.i18n),
    };
  },
} satisfies ExerciseAssessment;
