/**
 * Formula syntax for the truth-table exercise type.
 *
 * The language is not written here. It is whatever the exercise's `system=`
 * names — `logic/theories/carnap-prop.mm0`, registered by `logic/specs`, when
 * the author names nothing — an ordinary MM0 signature with `@syntax`
 * annotations, read by `@aufbau/syntax`; this module only converts what that
 * parser returns into the {@link Formula} tree a table is built from. Writing
 * one back out is the library's printer, through `layout.ts`. The spec is the same kind of artifact a proof
 * exercise's `system=` names, and the same kind the model and translation
 * types read; before it there were two hand parsers here and next door, with
 * no way to make a course's truth tables and its models agree about what `A`
 * means.
 *
 * This module is DOM-free and imported by BOTH the worker (to compile a table
 * and grade authoritatively) and the client element (for instant local
 * checking), so it must not reach for any platform globals. The spec arrives
 * as a text import: no fetch, and the same reading on both sides.
 *
 * The default, `carnap-prop`, declares Carnap's `prop` notation:
 *   - `~`    negation      (unary prefix)
 *   - `/\`   conjunction
 *   - `\/`   disjunction
 *   - `->`   conditional   (right-associative)
 *   - `<->`  biconditional
 *
 * Those are the five that file declares, not the five this module can read:
 * it reads **all sixteen** binary truth functions plus `⊤` and `⊥`, one
 * `@syntax role` each (`logic/specs/connectives.ts`). A course whose textbook
 * uses the Sheffer stroke or exclusive disjunction declares the constructor in
 * an `aufbau-mm0` block extending `carnap-prop`, annotates it, names the
 * block with `system=`, and the table gives it a column with nothing changed
 * here.
 *
 * Sentence letters are a single Roman letter of either case. The hand parser
 * this replaced also read a bare-digit subscript (`P0`, `R12`); an MM0
 * signature is a finite vocabulary and cannot spell an unbounded one, and
 * Graham's call on 2026-08-24 was to accept the loss rather than hold the
 * unification for a library feature to restore it.
 *
 * In `carnap-prop`, precedence loosest to tightest is `<->` < `->` < `\/` <
 * `/\` < `~`; `/\`, `\/`, and `<->` are left-associative, `->` right. Another
 * system's ladder is its own.
 */

import type {
  AppTerm,
  SurfaceLanguage,
  Term as SurfaceTerm,
} from "@aufbau/syntax";
import { printTerm } from "@aufbau/syntax";
import { namedLanguage } from "../../../logic/specs/by-id";
import type { BinaryConnective } from "../../../logic/specs/connectives";
import { binaryConnectiveForRole } from "../../../logic/specs/connectives";
import type { FormulaParseError } from "../../../logic/specs/diagnostics";
import { formulaParseErrors } from "../../../logic/specs/diagnostics";
import { languageFromSource } from "../../../logic/specs/read";
import { roleIndex } from "../../../logic/specs/roles";

export type { BinaryConnective };

export type Formula =
  | { readonly type: "atom"; readonly name: string }
  | { readonly type: "verum" }
  | { readonly type: "falsum" }
  | { readonly type: "not"; readonly operand: Formula }
  | {
      readonly type: BinaryConnective;
      readonly left: Formula;
      readonly right: Formula;
    };

export type ParseError = FormulaParseError;

export type ParseResult =
  | {
      readonly ok: true;
      readonly formula: Formula;
      /** The formula as engine text, which is what an exercise stores. */
      readonly engine: string;
      /** The tree it was read from, which the grid is printed from. */
      readonly term: SurfaceTerm;
      /**
       * Each node of `term` read as a formula, by its path (`"0.1"`, `""`
       * for the root): what a printed piece of `term` evaluates.
       */
      readonly nodes: ReadonlyMap<string, Formula>;
    }
  | { readonly ok: false; readonly errors: readonly ParseError[] };

/**
 * What `system=` means on a truth table when the author does not write it.
 *
 * A default rather than the only possibility: a truth table is propositional,
 * but so is any number of textbooks' propositional notations, and there is no
 * reason this type alone should be unable to point at one. Extending it in an
 * `aufbau-mm0` block is also how a course gets a connective `carnap-prop` does
 * not declare — the roles are read, the notations are not shipped.
 */
export const PROP_LANGUAGE_ID = "carnap-prop";

/**
 * A spec node this module cannot read as a propositional formula, carrying the
 * complaint it will be reported as.
 *
 * The detail travels with the throw because the two ways to get here want
 * different sentences. A malformed tree — a connective the parser accepted with
 * an argument missing — is a defect nobody can act on and says so. A construct
 * the language *has* and this type cannot interpret is an ordinary authoring
 * mistake, and naming it is the whole point: "a truth table cannot interpret ∀"
 * is actionable where "this formula could not be read" is not.
 */
class Unreadable extends Error {
  constructor(readonly detail: ParseError) {
    super(detail.message);
  }
}

/** The tree is malformed: nothing to name, nowhere useful to point. */
function malformed(): Unreadable {
  return new Unreadable({
    message: "This formula could not be read.",
    position: 0,
  });
}

/**
 * The language has this construct and a truth table has no reading for it.
 *
 * Quoted as the writer spelled it where the parser recorded a token, else as
 * the spec's canonical spelling of the role, else by constructor name — a
 * lexicon letter is written as its own name and has no notation to report.
 */
function uninterpretable(
  node: AppTerm,
  lang: SurfaceLanguage,
  role: string | null,
): Unreadable {
  const spelled = role === null ? null : roleIndex(lang).spellingFor(role);

  return new Unreadable({
    message:
      "“{construct}” is not something this exercise type can interpret.",
    params: { construct: node.token ?? spelled ?? node.term },
    position: node.span.start,
  });
}

/**
 * Whether this node would swallow a sentence.
 *
 * The test that lets an unrolled constructor be an atom without letting an
 * unannotated connective become one. `F`, `F(a)` and `R(a,b)` take arguments at
 * the *sequence* sort and are atomic — the whole open-ended half of a language.
 * A `term box (p: wff): wff;` with no `@syntax role` takes an argument at the
 * sentence sort, and reading it as an atom would silently discard the
 * subformula and turn the exercise into a different, trivial one.
 *
 * Sorts are compared against the node's own rather than looked up in the spec,
 * because a node in formula position is at the sentence sort by construction.
 */
function swallowsSentence(node: AppTerm): boolean {
  return node.args.some((argument) => argument.sort === node.sort);
}

/** Built once; a language is tables, not data. */
function prop(): SurfaceLanguage {
  const found = namedLanguage(PROP_LANGUAGE_ID);

  if (found === null) {
    throw new Error(`the ${PROP_LANGUAGE_ID} spec is no longer registered`);
  }

  return found;
}

/** Where a formula's nodes are recorded as they are read. */
interface Reading {
  readonly lang: SurfaceLanguage;
  readonly nodes: Map<string, Formula>;
}

function operand(
  node: SurfaceTerm | undefined,
  reading: Reading,
  path: readonly number[],
): Formula {
  if (node === undefined) {
    throw malformed();
  }

  return readFormula(node, reading, path);
}

/**
 * One parsed node as a formula, dispatched on its `@syntax role`.
 *
 * The dispatch is a whitelist and the `default` arm is not a leftover: a
 * declared role is the spec author's claim that a constructor *means*
 * something, and a type with no reading for it must say so rather than treat
 * it as opaque. `identity` is refused by that rule like any other — which is
 * what keeps `a ≠ b`, a `def` that parses without unfolding, from becoming a
 * column independent of `~(a = b)` that a student could make true alongside it.
 *
 * A constructor with no role at all is an atom: a `carnap-prop` sentence
 * letter, a forallx letter at the elided empty sequence, or that letter applied
 * to terms. It is keyed by how it *prints* rather than by its constructor name,
 * so `F(a)` and `F(b)` are two columns; keying by name gave both the column `F`
 * and read `F(a) /\ ~F(b)` as a contradiction.
 *
 * Every binary role goes through one lookup rather than a case apiece, because
 * a truth table's reading of a connective is exactly its truth function and
 * nothing else — `logic/specs/connectives.ts` holds all sixteen. What is left
 * to case on is the handful that are not binary.
 *
 * Each node read is recorded under its path in the tree, which is how the
 * grid finds the formula a printed piece of the tree evaluates.
 */
function readFormula(
  node: SurfaceTerm,
  reading: Reading,
  path: readonly number[],
): Formula {
  const formula = readNode(node, reading, path);

  reading.nodes.set(path.join("."), formula);
  return formula;
}

/** {@link readFormula}'s dispatch, before the node is recorded. */
function readNode(
  node: SurfaceTerm,
  reading: Reading,
  path: readonly number[],
): Formula {
  const { lang } = reading;

  if (node.kind === "variable") {
    throw malformed();
  }

  const role = roleIndex(lang).roleOf(node.term);

  switch (role) {
    case null:
      if (swallowsSentence(node)) {
        throw uninterpretable(node, lang, role);
      }

      return { name: printTerm(lang, node, "display"), type: "atom" };
    case "negation":
      return {
        operand: operand(node.args[0], reading, [...path, 0]),
        type: "not",
      };
    case "verum":
      return { type: "verum" };
    case "falsum":
      return { type: "falsum" };
    default: {
      const connective = binaryConnectiveForRole(role);

      if (connective === null) {
        throw uninterpretable(node, lang, role);
      }

      return {
        left: operand(node.args[0], reading, [...path, 0]),
        right: operand(node.args[1], reading, [...path, 1]),
        type: connective,
      };
    }
  }
}

/**
 * Parse a single propositional formula, collecting every syntax error it has.
 *
 * The language is a parameter rather than this module's own, because a truth
 * table names one in `system=` like every other type that reads a formula. It
 * defaults to the shipped `carnap-prop` for the callers holding an artifact
 * compiled before the attribute existed.
 */
export function parseFormula(
  source: string,
  lang: SurfaceLanguage = prop(),
): ParseResult {
  return readParse(lang.parse(source), lang);
}

/**
 * Read back a formula an exercise stored: the engine text
 * {@link parseFormula} gave it, without the lints, which were applied when
 * the author's text was read.
 */
export function parseEngineFormula(
  engine: string,
  lang: SurfaceLanguage = prop(),
): ParseResult {
  return readParse(
    lang.parse(engine, { lints: false, mode: "engine" }),
    lang,
  );
}

function readParse(
  result: ReturnType<SurfaceLanguage["parse"]>,
  lang: SurfaceLanguage,
): ParseResult {
  if (!result.ok) {
    return { errors: formulaParseErrors(result.diagnostics), ok: false };
  }

  try {
    const nodes = new Map<string, Formula>();

    return {
      engine: printTerm(lang, result.term, "engine"),
      formula: readFormula(result.term, { lang, nodes }, []),
      nodes,
      ok: true,
      term: result.term,
    };
  } catch (error) {
    if (error instanceof Unreadable) {
      return { errors: [error.detail], ok: false };
    }

    throw error;
  }
}

/**
 * The language a truth-table exercise is set in, or `null` where its stored
 * data no longer names one.
 *
 * The mirror of the formula kit's reader (`exercise-kit/formula/`). `source`
 * is the language's own text, joined in from the document's systems table;
 * its absence — an artifact stored before the table had a `system=` — is
 * what this type has always spoken.
 *
 * `null` means there is no language here, not that this one is unsuitable. A
 * predicate language is a perfectly good one to set a table in — `F(a)` and
 * `R(a,b)` are columns like any other — and a construct the table has no column
 * for is refused where it is written, by {@link parseFormula}, which can say
 * which construct it was.
 */
export function truthTableLanguage(data: {
  readonly source?: string;
}): SurfaceLanguage | null {
  return data.source === undefined
    ? namedLanguage(PROP_LANGUAGE_ID)
    : languageFromSource(data.source);
}
