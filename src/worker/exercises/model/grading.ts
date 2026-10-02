/**
 * Turning stored exercise data back into something the logic core can judge.
 *
 * The field list is **derived**, not stored: it follows from the formulas, so
 * keeping a copy in `publicData` would only be a second thing that could drift.
 * This is the same choice `truth-table/grading.ts` makes with `resolveTable`,
 * and the parse it costs is a handful of formulas.
 *
 * DOM-free and free of i18n, because the client element resolves the same public
 * data to run its local Check.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import type {
  Formula,
  ModelField,
  ModelProblem,
  ModelTarget,
  ModelTask,
  ModelVerdict,
} from "./logic";
import {
  checkModel,
  DOMAIN_FIELD_LABEL,
  fieldForLabel,
  firstOrderLanguageFor,
  formatFunctionTable,
  modelSignature,
  parseEngineFormula,
  parseFormula,
  parseFunctionTable,
  splitFormulaList,
  tupleKey,
} from "./logic";
import type { ModelAnswerData, ModelPublicData, ModelVariant } from "./types";

/** A resolved exercise: its language, its parsed formulas, and its field list. */
export interface ResolvedModel {
  readonly language: SurfaceLanguage;
  readonly signature: readonly ModelField[];
  readonly task: ModelTask;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isTarget(value: unknown): value is ModelTarget {
  return (
    value === "all-true" || value === "all-false" || value === "not-all-equal"
  );
}

function isVariant(value: unknown): value is ModelVariant {
  return value === "simple" || value === "validity" || value === "constraint";
}

function isPlayground(value: unknown): boolean {
  return value === undefined || value === true;
}

export function isModelPublicData(value: unknown): value is ModelPublicData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Partial<ModelPublicData>;

  return (
    typeof (data.system ?? data.dialect) === "string" &&
    typeof data.promptHtml === "string" &&
    isStringArray(data.required) &&
    isStringArray(data.targeted) &&
    isTarget(data.target) &&
    isVariant(data.variant) &&
    isPlayground(data.playground) &&
    typeof data.options === "object" &&
    data.options !== null
  );
}

export function isModelAnswerData(value: unknown): value is ModelAnswerData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Partial<ModelAnswerData>;

  if (typeof data.domain !== "string") {
    return false;
  }

  if (typeof data.fields !== "object" || data.fields === null) {
    return false;
  }

  if (data.sentences !== undefined && typeof data.sentences !== "string") {
    return false;
  }

  return Object.values(data.fields).every(
    (entry) => typeof entry === "string",
  );
}

/** Engine text read back to formulas, or `null` when any of it will not parse. */
function parseEngineList(
  sources: readonly string[],
  language: SurfaceLanguage,
): Formula[] | null {
  const formulas: Formula[] = [];

  for (const source of sources) {
    const parsed = parseEngineFormula(source, language);

    if (!parsed.ok) {
      return null;
    }

    formulas.push(parsed.formula);
  }

  return formulas;
}

/**
 * Parse the stored formulas and work out which fields they ask for.
 *
 * `null` when the stored data no longer resolves — an unknown language id, or a
 * formula that will not parse. Neither can happen for data this compiler wrote;
 * both are how a revision authored against a future version fails safely rather
 * than being graded against half a signature.
 *
 * A playground has no formulas of its own, so it never resolves here: its
 * fields depend on what the student wrote, which is {@link resolveModelFor}.
 */
export function resolveModel(
  publicData: ModelPublicData,
): ResolvedModel | null {
  const language = firstOrderLanguageFor(publicData);

  if (language === null) {
    return null;
  }

  const required = parseEngineList(publicData.required, language);
  const targeted = parseEngineList(publicData.targeted, language);

  if (required === null || targeted === null || targeted.length === 0) {
    return null;
  }

  return {
    language,
    signature: modelSignature([...required, ...targeted], language),
    task: { required, target: publicData.target, targeted },
  };
}

/** A resolved exercise, and what stands in the way of grading it, if anything. */
export interface ModelResolution {
  /** `null` when the stored data no longer resolves, as {@link resolveModel}. */
  readonly resolved: ResolvedModel | null;
  readonly problem: ModelProblem | null;
}

/**
 * The exercise as one student's answer sees it.
 *
 * For a fixed exercise that is {@link resolveModel}, whatever was typed. For a
 * playground the fields follow from the sentences: the fields the author's
 * givens name plus every symbol the sentences use, with the sentences that read
 * as the task. A sentence that does not read is a problem the fields cannot be
 * judged under; the signature then holds whatever did read, so a widget can
 * keep showing a model while its owner is mid-keystroke.
 *
 * Under `strictGivens` the model is the author's and cannot grow: a sentence
 * using a symbol the givens do not name is refused, and the signature stays the
 * givens' own.
 */
export function resolveModelFor(
  publicData: ModelPublicData,
  sentences = "",
): ModelResolution {
  if (publicData.playground === undefined) {
    return { problem: null, resolved: resolveModel(publicData) };
  }

  const language = firstOrderLanguageFor(publicData);

  if (language === null) {
    return { problem: null, resolved: null };
  }

  const vocabulary = Object.keys(publicData.givens ?? {}).flatMap((label) => {
    const field = fieldForLabel(label, language);
    return field === null ? [] : [field];
  });

  const pieces = splitFormulaList(sentences)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== "");
  const typed: Formula[] = [];
  let problem: ModelProblem | null =
    pieces.length === 0 ? { kind: "sentences-missing" } : null;

  for (const piece of pieces) {
    const parsed = parseFormula(piece, language);

    if (parsed.ok) {
      typed.push(parsed.formula);
    } else if (problem === null) {
      const error = parsed.errors[0];

      problem = {
        kind: "sentence-unreadable",
        message: error?.message ?? "This formula could not be read.",
        ...(error?.params === undefined
          ? {}
          : { params: error.params as Readonly<Record<string, string>> }),
        sentence: piece,
      };
    }
  }

  const own = modelSignature([], language, vocabulary);
  let signature = modelSignature(typed, language, vocabulary);

  if (publicData.options.strictGivens) {
    const known = new Set(own.map((field) => field.label));
    const outside = signature.find((field) => !known.has(field.label));

    if (outside !== undefined) {
      problem ??= { kind: "symbol-outside-model", symbol: outside.label };
      signature = own;
    }
  }

  return {
    problem,
    resolved: {
      language,
      signature,
      task: { required: [], target: publicData.target, targeted: typed },
    },
  };
}

/**
 * The rows a function's given fixes, keyed by argument tuple.
 *
 * A given for a function names the arguments it decides and leaves the rest to
 * the student: `f(_) : [0;1]` over the domain `0,1` says `f(0) = 1` and nothing
 * about `f(1)`. Both the rendered value table and grading read it this way, so
 * this is the one place that turns the spelling into cells. An unreadable given
 * seeds nothing; the compiler has already refused it.
 */
export function seededFunctionRows(
  given: string,
  arity: number,
): ReadonlyMap<string, number> {
  const parsed = parseFunctionTable(given, arity);

  return new Map(
    parsed.ok
      ? parsed.value.map((row) => [tupleKey(row.args), row.value])
      : [],
  );
}

/**
 * A locked function given put back over what was submitted, cell by cell.
 *
 * Substituting the whole field the way the other kinds do would grade the
 * student's table against a partial function — the given says nothing about the
 * arguments it does not name, and a value table with a hole in it is not a
 * model. So the given's rows win and the rest of the submitted table stands.
 */
function withFunctionGiven(
  given: string,
  submitted: string,
  arity: number,
): string {
  const fixed = parseFunctionTable(given, arity);
  const student = parseFunctionTable(submitted, arity);

  if (!fixed.ok || !student.ok) {
    return given;
  }

  const rows = new Map(student.value.map((row) => [tupleKey(row.args), row]));

  for (const row of fixed.value) {
    rows.set(tupleKey(row.args), row);
  }

  return formatFunctionTable([...rows.values()]);
}

/**
 * The model to grade: the student's fields, with any locked given put back.
 *
 * A locked given (`strictGivens`) is a requirement rather than a hint, so
 * grading substitutes it for whatever arrived: the field renders inert, and
 * an answer that disagrees with it has been tampered with rather than worked.
 * The original crashes the widget in that case (`Prelude.error "input not
 * equal to given"`); ignoring the submitted value grades the exercise that
 * was set.
 *
 * The signature says which fields are functions, whose givens go back cell by
 * cell; pass the resolved one where it is already at hand rather than paying for
 * a second parse of the formulas.
 */
export function effectiveAnswer(
  publicData: ModelPublicData,
  answer: ModelAnswerData,
  signature?: readonly ModelField[],
): ModelAnswerData {
  if (!publicData.options.strictGivens || publicData.givens === undefined) {
    return answer;
  }

  const givens = publicData.givens;
  const byLabel = new Map(
    (signature ?? resolveModel(publicData)?.signature ?? []).map((field) => [
      field.label,
      field,
    ]),
  );
  const fields = { ...answer.fields };

  for (const [label, value] of Object.entries(givens)) {
    if (label === DOMAIN_FIELD_LABEL) {
      continue;
    }

    const field = byLabel.get(label);

    fields[label] =
      field?.kind === "function"
        ? withFunctionGiven(value, fields[label] ?? "", field.arity)
        : value;
  }

  return { domain: givens[DOMAIN_FIELD_LABEL] ?? answer.domain, fields };
}

/** An answer graded: the exercise it was graded against, and how it did. */
export interface ModelJudgement {
  /** The model as it was graded, locked givens put back. */
  readonly graded: ModelAnswerData;
  /** `null` when the stored data no longer resolves. */
  readonly resolved: ResolvedModel | null;
  readonly verdict: ModelVerdict | null;
}

/**
 * Grade an answer: the one computation the worker's evaluation and review and
 * the browser's Check all run, so none of them can disagree about a playground.
 */
export function judgeAnswer(
  publicData: ModelPublicData,
  answer: ModelAnswerData,
): ModelJudgement {
  const { problem, resolved } = resolveModelFor(publicData, answer.sentences);

  if (resolved === null) {
    return { graded: answer, resolved, verdict: null };
  }

  const graded = effectiveAnswer(publicData, answer, resolved.signature);

  if (problem !== null) {
    return {
      graded,
      resolved,
      verdict: {
        ok: false,
        problem,
        requiredFalse: [],
        targetMissed: false,
        targetOffenders: [],
      },
    };
  }

  return {
    graded,
    resolved,
    verdict: checkModel(resolved.signature, resolved.task, graded),
  };
}
