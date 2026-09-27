/**
 * A verdict in words, for the widget's Check line and the review page alike.
 *
 * `detail` is the feedback setting's line between `full` and `terse`: with it
 * the sentence names what failed, without it it says only whether the answer
 * does what was asked. DOM-free and catalog-free: it words through a
 * {@link WorldWords} lookup, which the browser fills from its hydration
 * strings.
 */

import type { ResolvedWorld } from "./grading";
import type { WorldWords } from "./kinds/contract";
import type { WorldVerdict } from "./logic/check";

function formulas(
  resolved: ResolvedWorld,
  indices: readonly number[],
): string {
  return indices
    .map((index) => resolved.sentences[index]?.text ?? "")
    .join(", ");
}

export function describeWorldVerdict(
  verdict: WorldVerdict,
  resolved: ResolvedWorld,
  words: WorldWords,
  detail = true,
): string {
  if (verdict.type === "evaluate") {
    if (verdict.ok) {
      return words("Every sentence is marked correctly.");
    }

    const counts = {
      correct: String(verdict.correct),
      total: String(verdict.total),
    };

    return detail
      ? words(
          "Correct: {correct} of {total}. Take another look at: {formulas}.",
          {
            ...counts,
            formulas: formulas(
              resolved,
              [...verdict.wrong, ...verdict.unmarked].sort((a, b) => a - b),
            ),
          },
        )
      : words("Correct: {correct} of {total}.", counts);
  }

  if (verdict.type === "distinguish") {
    if (verdict.ok) {
      return words("The sentence is true in world A and false in world B.");
    }

    if (!detail) {
      return verdict.empty
        ? words("Write a sentence first.")
        : words("The sentence does not tell the two worlds apart.");
    }

    if (verdict.empty) {
      return words("Write a sentence first.");
    }

    const error = verdict.errors[0];

    if (error !== undefined) {
      return words(
        error.message as Parameters<WorldWords>[0],
        error.params as Readonly<Record<string, string>> | undefined,
      );
    }

    if (verdict.open.length > 0) {
      return words("The sentence has free variables: {variables}.", {
        variables: verdict.open.join(", "),
      });
    }

    if (verdict.uninterpreted.length > 0) {
      return words("This world gives no meaning to {symbols}.", {
        symbols: verdict.uninterpreted
          .map((symbol) =>
            symbol.arity === 0
              ? symbol.name
              : `${symbol.name}(${Array.from({ length: symbol.arity }, () => "_").join(",")})`,
          )
          .join(", "),
      });
    }

    if (verdict.disallowed.length > 0) {
      return words("This exercise does not allow {symbols}.", {
        symbols: verdict.disallowed.join(" "),
      });
    }

    if (verdict.unnamed.length > 0) {
      return words(
        "Not every name in the sentence names something in both worlds: {names}.",
        { names: verdict.unnamed.join(", ") },
      );
    }

    if (verdict.inA === false && verdict.inB === true) {
      return words("The sentence is false in world A and true in world B.");
    }

    return verdict.inA === false
      ? words("The sentence is false in world A.")
      : words("The sentence is true in world B.");
  }

  if (verdict.ok) {
    return words("This world does everything the exercise asks.");
  }

  if (!detail) {
    return words("This world does not yet do everything the exercise asks.");
  }

  if (verdict.unreadable) {
    return words("This answer holds no world.");
  }

  const problem = verdict.problems[0];

  if (problem !== undefined) {
    return resolved.kind.describeProblem(verdict.world, problem, words);
  }

  if (verdict.pinBroken.length > 0) {
    return words("These are pinned and have been changed: {objects}.", {
      objects: verdict.pinBroken
        .map((id) => resolved.kind.describeObject(resolved.start, id, words))
        .join("; "),
    });
  }

  if (verdict.overBudget !== null) {
    return words(
      "This world changes {used} objects; the most allowed is {limit}.",
      {
        limit: String(verdict.overBudget.limit),
        used: String(verdict.overBudget.used),
      },
    );
  }

  if (verdict.unnamed.length > 0) {
    return words("Nothing in this world is named {names}.", {
      names: verdict.unnamed.join(", "),
    });
  }

  if (verdict.lawsBroken.length > 0) {
    return words("Not every law holds. Take another look at: {formulas}.", {
      formulas: verdict.lawsBroken
        .map((index) => resolved.laws[index]?.text ?? "")
        .join(", "),
    });
  }

  return words(
    "Not every sentence comes out as marked. Take another look at: {formulas}.",
    { formulas: formulas(resolved, verdict.missed) },
  );
}
