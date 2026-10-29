import type { Translator } from "../../i18n/translator";

/**
 * What a student does in any of the four proof exercises
 * (`ExerciseType.instructions`): prove the goal the widget shows, or, in a
 * playground, prove anything at all with every line justified.
 */
export function proofInstructions(
  i18n: Translator,
): Readonly<Record<"playground" | "proof", string>> {
  return {
    playground: i18n.t(
      "Write a proof of anything you like; every line must follow by a rule.",
    ),
    proof: i18n.t("Write a proof of the goal."),
  };
}
