/**
 * The evaluation game: the student claims a sentence is true or false in the
 * world, and defends the claim against the computer, one part of the sentence
 * at a time, until an atomic sentence settles it.
 *
 * A position is always a subformula of the sentence as written, a claimed
 * value, and the objects bound to the variables so far. Nothing is rewritten:
 * `¬A` flips the claim and moves to `A`, and a conditional is played on its
 * own parts rather than as `¬A ∨ B`. So the reader is never shown a formula
 * the author did not write.
 *
 * One rule covers every binary truth function. The student names a smallest
 * set of values for the two parts that forces the claim (the kit's
 * `forcingSets`), and the computer then challenges one entry of it. Each step
 * is skipped when it offers only one option. For `∧` and `∨` that is the textbook game; `↔` and
 * the rarer functions take both steps. A quantifier's object is chosen by the
 * student when the claim needs a witness (`∃` true, `∀` false) and by the
 * computer when it needs every object.
 *
 * The computer plays to win, and deterministically, so the grader can replay
 * a submitted game from the student's choices alone. A student with a true
 * claim can always win, and one with a false claim always loses.
 *
 * DOM-free and free of i18n: the browser plays the game, and the worker
 * replays it to grade.
 */

import type { Formula, PartValues } from "../../../exercise-kit/formula";
import { forcingSets, satisfies } from "../../../exercise-kit/formula";
import type { BinaryConnective } from "../../../logic/specs/connectives";
import type { WorldStructure } from "./structure";

/**
 * One of the student's choices: the id of the object chosen for a quantifier,
 * or the values chosen for a connective's parts. Stored as the values rather
 * than as an index into a list of options, so what an answer means does not
 * depend on the order the options are offered in.
 */
export type GameChoice = string | PartValues;

/** One sentence's game, as the answer stores it. */
export interface WorldGameAnswer {
  readonly claim: boolean;
  readonly choices: readonly GameChoice[];
}

/** Where the game stands after a move. */
export interface GamePosition {
  /** Child indices from the sentence down to this subformula. */
  readonly path: readonly number[];
  readonly formula: Formula;
  readonly claim: boolean;
  /** Each bound variable and the id of its object, outermost first. */
  readonly bindings: readonly (readonly [string, string])[];
}

/**
 * One move of the game. `right` says whether the student's claim can still be
 * defended after it: it starts false only for a wrong first claim, and only a
 * student's move can make it false later. It is what full feedback points at.
 */
export type GameStep =
  | {
      /** The first claim about the sentence. */
      readonly type: "claim";
      readonly to: GamePosition;
      readonly right: boolean;
    }
  | {
      /** A claim carried into a part without a choice: through `¬`, or into
       *  the one part a connective leaves. */
      readonly type: "follow";
      readonly to: GamePosition;
      readonly right: boolean;
    }
  | {
      readonly type: "object";
      readonly by: "student" | "computer";
      readonly variable: string;
      readonly object: string;
      readonly to: GamePosition;
      readonly right: boolean;
    }
  | {
      /** The student commits to values for both parts; the computer then
       *  picks the one to play on. */
      readonly type: "parts";
      readonly values: PartValues;
      readonly right: boolean;
    }
  | {
      /** A part is chosen to play on, with the value claimed for it. */
      readonly type: "part";
      readonly by: "student" | "computer";
      readonly to: GamePosition;
      readonly right: boolean;
    };

/** How a game ended. */
export type GameEnd =
  /** The formula's value decides: an atomic sentence, or a connective whose
   *  value its parts cannot change. */
  | { readonly reason: "value"; readonly value: boolean }
  /** The world is empty, so a quantifier has no object to choose. */
  | {
      readonly reason: "no-object";
      readonly by: "student" | "computer";
      readonly variable: string;
    };

export type GameState =
  | {
      readonly type: "choose-object";
      readonly position: GamePosition;
      readonly variable: string;
    }
  | {
      readonly type: "choose-parts";
      readonly position: GamePosition;
      readonly options: readonly PartValues[];
    }
  | {
      readonly type: "over";
      readonly position: GamePosition;
      readonly won: boolean;
      readonly end: GameEnd;
    }
  /** A stored choice that does not fit the game: not a legal move where it
   *  was made, or a move after the game ended. */
  | { readonly type: "invalid" };

export interface PlayedGame {
  readonly steps: readonly GameStep[];
  readonly state: GameState;
}

type Binary = Extract<
  Formula,
  { readonly left: Formula; readonly right: Formula }
>;

function isBinary(formula: Formula): formula is Binary {
  return (
    "left" in formula && "right" in formula && formula.type !== "identity"
  );
}

function sameValues(a: PartValues, b: PartValues): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Whether a stored choice has the shape of one. */
export function isGameChoice(value: unknown): value is GameChoice {
  if (typeof value === "string") {
    return true;
  }

  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry) => entry === null || typeof entry === "boolean")
  );
}

export function isWorldGameAnswer(value: unknown): value is WorldGameAnswer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const game = value as Partial<WorldGameAnswer>;

  return (
    typeof game.claim === "boolean" &&
    Array.isArray(game.choices) &&
    game.choices.every(isGameChoice)
  );
}

/**
 * Play a game from its first claim and the student's choices, making the
 * computer's moves as they come due.
 *
 * The computer's rule, which grading depends on being fixed: of the objects
 * or parts open to it, the first that makes the student's claim false, and
 * failing that the first. Objects come in the world's own order, parts left
 * before right.
 */
export function playGame(
  sentence: Formula,
  world: WorldStructure,
  game: WorldGameAnswer,
): PlayedGame {
  const { ids, structure } = world;
  const steps: GameStep[] = [];
  const elements = new Map(ids.map((id, element) => [id, element]));
  let next = 0;

  const assignment = (position: GamePosition): Map<string, number> =>
    new Map(
      position.bindings.map(([variable, id]) => [
        variable,
        elements.get(id) ?? 0,
      ]),
    );
  const holds = (position: GamePosition): boolean =>
    satisfies(position.formula, structure, assignment(position)) ===
    position.claim;

  let position: GamePosition = {
    bindings: [],
    claim: game.claim,
    formula: sentence,
    path: [],
  };
  steps.push({ right: holds(position), to: position, type: "claim" });

  const over = (end: GameEnd, won: boolean): PlayedGame =>
    game.choices.length > next
      ? { state: { type: "invalid" }, steps }
      : { state: { end, position, type: "over", won }, steps };

  for (;;) {
    const formula = position.formula;

    if (formula.type === "not") {
      position = {
        ...position,
        claim: !position.claim,
        formula: formula.operand,
        path: [...position.path, 0],
      };
      steps.push({ right: holds(position), to: position, type: "follow" });
      continue;
    }

    if (formula.type === "forall" || formula.type === "exists") {
      const studentChooses = (formula.type === "exists") === position.claim;
      const into = (object: string): GamePosition => ({
        bindings: [...position.bindings, [formula.variable, object]],
        claim: position.claim,
        formula: formula.body,
        path: [...position.path, 0],
      });

      if (ids.length === 0) {
        return over(
          {
            by: studentChooses ? "student" : "computer",
            reason: "no-object",
            variable: formula.variable,
          },
          !studentChooses,
        );
      }

      let object: string;

      if (studentChooses) {
        const choice = game.choices[next];

        if (choice === undefined) {
          return {
            state: {
              position,
              type: "choose-object",
              variable: formula.variable,
            },
            steps,
          };
        }

        if (typeof choice !== "string" || !elements.has(choice)) {
          return { state: { type: "invalid" }, steps };
        }

        next += 1;
        object = choice;
      } else {
        object = ids.find((id) => !holds(into(id))) ?? (ids[0] as string);
      }

      position = into(object);
      steps.push({
        by: studentChooses ? "student" : "computer",
        object,
        right: holds(position),
        to: position,
        type: "object",
        variable: formula.variable,
      });
      continue;
    }

    if (isBinary(formula)) {
      const connective = formula.type as BinaryConnective;
      const options = forcingSets(connective, position.claim);

      if (options === null || options.length === 0) {
        return over(
          {
            reason: "value",
            value: options === null ? position.claim : !position.claim,
          },
          options === null,
        );
      }

      let values: PartValues;
      let chosen = false;

      if (options.length === 1) {
        values = options[0] as PartValues;
      } else {
        const choice = game.choices[next];

        if (choice === undefined) {
          return {
            state: { options, position, type: "choose-parts" },
            steps,
          };
        }

        const match =
          typeof choice === "string"
            ? undefined
            : options.find((option) => sameValues(option, choice));

        if (match === undefined) {
          return { state: { type: "invalid" }, steps };
        }

        next += 1;
        values = match;
        chosen = true;
      }

      const part = (side: 0 | 1): GamePosition => ({
        bindings: position.bindings,
        claim: values[side] as boolean,
        formula: side === 0 ? formula.left : formula.right,
        path: [...position.path, side],
      });
      const open = ([0, 1] as const).filter((side) => values[side] !== null);

      if (open.length === 1) {
        position = part(open[0] as 0 | 1);
        steps.push(
          chosen
            ? {
                by: "student",
                right: holds(position),
                to: position,
                type: "part",
              }
            : { right: holds(position), to: position, type: "follow" },
        );
        continue;
      }

      if (chosen) {
        steps.push({
          right: holds(part(0)) && holds(part(1)),
          type: "parts",
          values,
        });
      }

      const side = open.find((candidate) => !holds(part(candidate))) ?? 0;
      position = part(side);
      steps.push({
        by: "computer",
        right: holds(position),
        to: position,
        type: "part",
      });
      continue;
    }

    // An atomic sentence, ⊥ or ⊤: the world decides.
    const value = satisfies(formula, structure, assignment(position));
    return over({ reason: "value", value }, value === position.claim);
  }
}

/** Whether the student won a stored game; unplayed and unfinished games are not won. */
export function gameWon(
  sentence: Formula,
  world: WorldStructure,
  game: WorldGameAnswer | null,
): boolean {
  if (game === null) {
    return false;
  }

  const { state } = playGame(sentence, world, game);
  return state.type === "over" && state.won;
}
