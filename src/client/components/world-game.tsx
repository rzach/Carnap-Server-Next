/** @jsxImportSource preact */
/**
 * The evaluation game's half of the world element: the sentence with the part
 * now being played marked in it, the moves so far in words, and the choice the
 * student has to make next.
 *
 * The game itself is `logic/game.ts`, shared with the grader; this module only
 * words it. Every sentence it builds names a subformula by its span in the
 * displayed sentence, so the reader sees only text the author wrote, and every
 * sentence about a block is the kind's own, worded whole.
 */

import type {
  FormulaNode,
  PartValues,
} from "../../worker/exercise-kit/formula";
import {
  formulaToString,
  parseFormulaTree,
} from "../../worker/exercise-kit/formula";
import type { ResolvedWorld } from "../../worker/exercises/world/grading";
import type { WorldWords } from "../../worker/exercises/world/kinds/contract";
import type {
  GamePosition,
  GameStep,
  PlayedGame,
} from "../../worker/exercises/world/logic/game";

/** The node a path of child indices leads to. */
function nodeAt(
  root: FormulaNode | null,
  path: readonly number[],
): FormulaNode | undefined {
  let node: FormulaNode | undefined = root ?? undefined;

  for (const index of path) {
    node = node?.children[index];
  }

  return node;
}

/** How the game names the parts of one sentence. */
export interface GameText {
  /** A position's subformula, as the sentence displays it. */
  readonly of: (position: Pick<GamePosition, "formula" | "path">) => string;
  /** Its span in the displayed sentence, when the parse keeps one. */
  readonly span: (
    path: readonly number[],
  ) => { readonly start: number; readonly end: number } | null;
}

/**
 * Name subformulas by their spans in the displayed sentence. A node is used
 * only when it is the formula the game is at, so a language whose parse tree
 * does not line up with the formula tree falls back to printing the part.
 */
export function gameText(text: string, resolved: ResolvedWorld): GameText {
  const tree = parseFormulaTree(text, resolved.language);
  const at = (
    position: Pick<GamePosition, "formula" | "path">,
  ): FormulaNode | undefined => {
    const node = nodeAt(tree, position.path);

    return node !== undefined &&
      JSON.stringify(node.formula) === JSON.stringify(position.formula)
      ? node
      : undefined;
  };

  return {
    of: (position) => {
      const node = at(position);

      return node === undefined
        ? formulaToString(position.formula, resolved.language)
        : text.slice(node.start, node.end);
    },
    span: (path) => {
      const node = nodeAt(tree, path);
      return node === undefined ? null : { end: node.end, start: node.start };
    },
  };
}

/** A binary position's two parts. */
function parts(
  position: GamePosition,
): readonly [GamePosition, GamePosition] | null {
  const formula = position.formula;

  if (
    !("left" in formula) ||
    !("right" in formula) ||
    formula.type === "identity"
  ) {
    return null;
  }

  const part = (side: 0 | 1): GamePosition => ({
    bindings: position.bindings,
    claim: position.claim,
    formula: side === 0 ? formula.left : formula.right,
    path: [...position.path, side],
  });

  return [part(0), part(1)];
}

/**
 * Values for a connective's parts, in words: one part's value, or a row of
 * both. `sentence` picks between the transcript's sentence ("You say …") and
 * a choice button's phrase.
 */
export function partValuesText(
  values: PartValues,
  position: GamePosition,
  text: GameText,
  words: WorldWords,
  sentence: boolean,
): string {
  const both = parts(position);

  if (both === null) {
    return "";
  }

  const [leftValue, rightValue] = values;
  const left = text.of(both[0]);
  const right = text.of(both[1]);

  if (leftValue === null || rightValue === null) {
    const formula = leftValue === null ? right : left;
    const value = leftValue ?? rightValue;

    if (sentence) {
      return value
        ? words("You say {formula} is true.", { formula })
        : words("You say {formula} is false.", { formula });
    }

    return value
      ? words("{formula} is true", { formula })
      : words("{formula} is false", { formula });
  }

  const values2 = { left, right };

  if (leftValue && rightValue) {
    return sentence
      ? words("You say {left} and {right} are both true.", values2)
      : words("{left} and {right} are both true", values2);
  }

  if (!leftValue && !rightValue) {
    return sentence
      ? words("You say {left} and {right} are both false.", values2)
      : words("{left} and {right} are both false", values2);
  }

  if (leftValue) {
    return sentence
      ? words("You say {left} is true and {right} is false.", values2)
      : words("{left} is true and {right} is false", values2);
  }

  return sentence
    ? words("You say {left} is false and {right} is true.", values2)
    : words("{left} is false and {right} is true", values2);
}

/** One line of the transcript. */
export interface GameLine {
  readonly text: string;
  /** Set on the move that lost a game the student could have won. */
  readonly lostHere: boolean;
}

interface Describe {
  readonly kind: ResolvedWorld["kind"];
  readonly state: unknown;
  readonly text: GameText;
  readonly words: WorldWords;
}

function stepText(
  step: GameStep,
  before: GamePosition | null,
  describe: Describe,
): string {
  const { kind, state, text, words } = describe;

  switch (step.type) {
    case "claim":
      return step.to.claim
        ? words("You say {formula} is true.", { formula: text.of(step.to) })
        : words("You say {formula} is false.", { formula: text.of(step.to) });
    case "follow":
      return step.to.claim
        ? words("So you say {formula} is true.", {
            formula: text.of(step.to),
          })
        : words("So you say {formula} is false.", {
            formula: text.of(step.to),
          });
    case "object":
      return kind.objectSentence(
        state,
        step.object,
        step.by === "student"
          ? "game-student-choice"
          : "game-computer-choice",
        words,
        { variable: step.variable },
      );
    case "parts":
      return before === null
        ? ""
        : partValuesText(step.values, before, text, words, true);
    default: {
      const formula = text.of(step.to);

      if (step.by === "student") {
        return step.to.claim
          ? words("You say {formula} is true.", { formula })
          : words("You say {formula} is false.", { formula });
      }

      return step.to.claim
        ? words("I pick {formula}, which you say is true.", { formula })
        : words("I pick {formula}, which you say is false.", { formula });
    }
  }
}

/**
 * A game's moves in words, with the ending as its last line. `detail` (full
 * feedback) marks the move that lost a game the first claim could have won.
 */
export function gameLines(
  played: PlayedGame,
  describe: Describe,
  detail: boolean,
): readonly GameLine[] {
  const { state } = played;
  const lost = state.type === "over" && !state.won;
  const lostAt = lost ? played.steps.findIndex((step) => !step.right) : -1;
  const lines: GameLine[] = [];
  let before: GamePosition | null = null;

  for (const [index, step] of played.steps.entries()) {
    lines.push({
      lostHere: detail && index > 0 && index === lostAt,
      text: stepText(step, before, describe),
    });

    if (step.type !== "parts") {
      before = step.to;
    }
  }

  if (state.type === "over") {
    const { words, text } = describe;
    const end = state.end;
    let ending: string;

    if (end.reason === "no-object") {
      ending =
        end.by === "student"
          ? words("There is no block to choose for {variable}, so I win.", {
              variable: end.variable,
            })
          : words(
              "There is no block for me to choose for {variable}, so you win.",
              { variable: end.variable },
            );
    } else {
      const formula = text.of(state.position);

      ending = state.won
        ? end.value
          ? words("{formula} is true, so you win.", { formula })
          : words("{formula} is false, so you win.", { formula })
        : end.value
          ? words("{formula} is true, so I win.", { formula })
          : words("{formula} is false, so I win.", { formula });
    }

    lines.push({ lostHere: false, text: ending });
  }

  return lines;
}

/** Full feedback's note under a lost game, or nothing. */
export function lossNote(
  played: PlayedGame,
  words: WorldWords,
  detail: boolean,
): string {
  if (!detail || played.state.type !== "over" || played.state.won) {
    return "";
  }

  return played.steps[0]?.right === false
    ? words("Your first claim was wrong, so you could not win.")
    : words(
        "You could have won. The choice that lost the game is marked: take it back and try another.",
      );
}

/** The sentence, with the part the game is at marked. */
export function GameSentence({
  path,
  text,
  resolved,
}: {
  readonly path: readonly number[];
  readonly text: string;
  readonly resolved: ResolvedWorld;
}) {
  const span = gameText(text, resolved).span(path);

  if (span === null || path.length === 0) {
    return <span class="world-formula">{text}</span>;
  }

  return (
    <span class="world-formula">
      {text.slice(0, span.start)}
      <mark class="world-game-current">
        {text.slice(span.start, span.end)}
      </mark>
      {text.slice(span.end)}
    </span>
  );
}
