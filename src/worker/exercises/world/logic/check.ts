/**
 * Judging a world exercise: live truth values while the student works, and
 * the verdict the Check and the grader share.
 *
 * The verdict is data, not sentences, because both the worker and the browser
 * reach this module and each words it for its own reader
 * (`../verdict-text.ts`). There is no answer key: every truth value follows
 * from public data, so the browser's Check is the grader's computation, not an
 * approximation of it.
 */

import type { ParseError } from "../../../exercise-kit/formula";
import {
  freeVariables,
  parseFormula,
  satisfies,
} from "../../../exercise-kit/formula";
import type { ResolvedSentence, ResolvedWorld } from "../grading";
import type { WorldProblem } from "../kinds/contract";
import type { WorldAnswerData, WorldPublicData } from "../types";
import { restrictionBreaches } from "./restriction";
import type { UninterpretedSymbol } from "./structure";
import {
  formulaNames,
  uninterpretedSymbols,
  worldNames,
  worldStructure,
} from "./structure";

/**
 * A sentence's value in a world: `true` or `false`, or `null` when it cannot
 * be evaluated because a name it uses denotes nothing there.
 */
export type TruthValue = boolean | null;

/** The names a sentence uses that no object in the world has. */
export function missingNames(
  resolved: ResolvedWorld,
  state: unknown,
  sentence: ResolvedSentence,
): readonly string[] {
  const named = worldNames(resolved.kind, state);
  return formulaNames(sentence.formula).filter((name) => !named.has(name));
}

/** Every sentence's and every law's value in a world, as the editor shows them. */
export function truthValues(
  resolved: ResolvedWorld,
  state: unknown,
): { readonly laws: TruthValue[]; readonly sentences: TruthValue[] } {
  const { structure } = worldStructure(
    resolved.kind,
    state,
    resolved.vocabulary,
  );
  const named = worldNames(resolved.kind, state);
  const value = (sentence: ResolvedSentence): TruthValue =>
    formulaNames(sentence.formula).every((name) => named.has(name))
      ? satisfies(sentence.formula, structure)
      : null;

  return {
    laws: resolved.laws.map(value),
    sentences: resolved.sentences.map(value),
  };
}

/** How an edited world fared: build and counterexample. */
export interface EditVerdict {
  readonly type: "edit";
  readonly ok: boolean;
  /** Set when the answer carried no world of the kind's shape. */
  readonly unreadable: boolean;
  readonly problems: readonly WorldProblem[];
  readonly pinBroken: readonly string[];
  /** Set when the budget was overspent. */
  readonly overBudget: {
    readonly used: number;
    readonly limit: number;
  } | null;
  /** Names the sentences or laws use that no object in the world has. */
  readonly unnamed: readonly string[];
  readonly lawsBroken: readonly number[];
  /** Sentences whose value is not their target. */
  readonly missed: readonly number[];
  /** The submitted world, read; `null` when {@link unreadable}. */
  readonly world: unknown;
}

/** How a set of marks fared: evaluate. */
export interface EvaluateVerdict {
  readonly type: "evaluate";
  readonly ok: boolean;
  readonly correct: number;
  readonly total: number;
  /** The sentences marked wrongly or not at all. */
  readonly wrong: readonly number[];
  readonly unmarked: readonly number[];
}

/** How a sentence fared: distinguish. */
export interface DistinguishVerdict {
  readonly type: "distinguish";
  readonly ok: boolean;
  readonly empty: boolean;
  readonly errors: readonly ParseError[];
  readonly open: readonly string[];
  readonly uninterpreted: readonly UninterpretedSymbol[];
  readonly disallowed: readonly string[];
  readonly unnamed: readonly string[];
  readonly inA: TruthValue;
  readonly inB: TruthValue;
}

export type WorldVerdict = EditVerdict | EvaluateVerdict | DistinguishVerdict;

function judgeEdit(
  publicData: WorldPublicData,
  resolved: ResolvedWorld,
  world: unknown,
): EditVerdict {
  const { kind } = resolved;
  const state = kind.parseState(world);
  const failed: EditVerdict = {
    lawsBroken: [],
    missed: [],
    ok: false,
    overBudget: null,
    pinBroken: [],
    problems: [],
    type: "edit",
    unnamed: [],
    unreadable: true,
    world: null,
  };

  if (state === null) {
    return failed;
  }

  const problems = kind.problems(state);
  const pinBroken = kind.pinViolations(
    resolved.start,
    state,
    resolved.pinned,
  );
  const used = kind.distance(resolved.start, state);
  const overBudget =
    publicData.budget !== undefined && used > publicData.budget
      ? { limit: publicData.budget, used }
      : null;
  const named = worldNames(kind, state);
  const unnamed = [
    ...new Set(
      [...resolved.sentences, ...resolved.laws].flatMap((sentence) =>
        formulaNames(sentence.formula).filter((name) => !named.has(name)),
      ),
    ),
  ];
  const values = problems.length === 0 ? truthValues(resolved, state) : null;
  const lawsBroken =
    values?.laws.flatMap((value, index) => (value === true ? [] : [index])) ??
    [];
  const missed =
    values?.sentences.flatMap((value, index) =>
      value === resolved.sentences[index]?.target ? [] : [index],
    ) ?? [];

  return {
    lawsBroken,
    missed,
    ok:
      problems.length === 0 &&
      pinBroken.length === 0 &&
      overBudget === null &&
      unnamed.length === 0 &&
      lawsBroken.length === 0 &&
      missed.length === 0,
    overBudget,
    pinBroken,
    problems,
    type: "edit",
    unnamed,
    unreadable: false,
    world: state,
  };
}

function judgeEvaluate(
  resolved: ResolvedWorld,
  marks: readonly (boolean | null)[],
): EvaluateVerdict {
  const { sentences } = truthValues(resolved, resolved.start);
  const wrong: number[] = [];
  const unmarked: number[] = [];

  for (const [index, value] of sentences.entries()) {
    const mark = marks[index] ?? null;

    if (mark === null) {
      unmarked.push(index);
    } else if (mark !== value) {
      wrong.push(index);
    }
  }

  const total = sentences.length;
  const correct = total - wrong.length - unmarked.length;

  return {
    correct,
    ok: correct === total,
    total,
    type: "evaluate",
    unmarked,
    wrong,
  };
}

/** The student's distinguishing sentence, judged against both worlds. */
export function judgeDistinguish(
  publicData: WorldPublicData,
  resolved: ResolvedWorld,
  text: string,
): DistinguishVerdict {
  const verdict: DistinguishVerdict = {
    disallowed: [],
    empty: false,
    errors: [],
    inA: null,
    inB: null,
    ok: false,
    open: [],
    type: "distinguish",
    unnamed: [],
    uninterpreted: [],
  };

  if (text.trim() === "") {
    return { ...verdict, empty: true };
  }

  const parsed = parseFormula(text, resolved.language);

  if (!parsed.ok) {
    return { ...verdict, errors: parsed.errors };
  }

  const formula = parsed.formula;
  const open = freeVariables(formula);
  const uninterpreted = uninterpretedSymbols(formula, resolved.vocabulary);
  const disallowed =
    publicData.restriction === undefined
      ? []
      : (restrictionBreaches(
          text,
          resolved.language,
          publicData.restriction,
        ) ?? []);
  const worlds = resolved.worlds;

  if (
    worlds === null ||
    open.length > 0 ||
    uninterpreted.length > 0 ||
    disallowed.length > 0
  ) {
    return { ...verdict, disallowed, open, uninterpreted };
  }

  const sentence: ResolvedSentence = { formula, text };
  const unnamed = [
    ...new Set([
      ...missingNames(resolved, worlds.a, sentence),
      ...missingNames(resolved, worlds.b, sentence),
    ]),
  ];

  if (unnamed.length > 0) {
    return { ...verdict, unnamed };
  }

  const valueIn = (state: unknown): boolean =>
    satisfies(
      formula,
      worldStructure(resolved.kind, state, resolved.vocabulary).structure,
    );
  const inA = valueIn(worlds.a);
  const inB = valueIn(worlds.b);

  return { ...verdict, inA, inB, ok: inA && !inB };
}

/** The verdict on an answer, for whichever variant the exercise is. */
export function judgeWorld(
  publicData: WorldPublicData,
  resolved: ResolvedWorld,
  answer: WorldAnswerData,
): WorldVerdict {
  switch (publicData.variant) {
    case "evaluate":
      return judgeEvaluate(resolved, answer.values ?? []);
    case "distinguish":
      return judgeDistinguish(publicData, resolved, answer.sentence ?? "");
    default:
      return judgeEdit(publicData, resolved, answer.world);
  }
}

/** What an answer is worth, as a fraction of the exercise's points. */
export function verdictScore(verdict: WorldVerdict): number {
  if (verdict.type === "evaluate") {
    return verdict.total === 0 ? 0 : verdict.correct / verdict.total;
  }

  return verdict.ok ? 1 : 0;
}
