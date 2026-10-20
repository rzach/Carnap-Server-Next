/**
 * First-order syntax for the exercise types that read formulas — the model and
 * the translation.
 *
 * The reading is of the parsed *tree*, never of the notation: a symbol is its
 * constructor's name applied to the arguments its binders hold, so `plus (x y:
 * tm): tm` written `x + y`, a fixed-arity `Red(a)`, and a textbook's variadic
 * `R(a,b)` or `Rab` all become the same shape. What the spec has to say is
 * which sorts hold *individuals* (`@syntax role individual`; a symbol is
 * interpreted only over those, see {@link firstOrderSignature}) and which,
 * if any, a variadic letter's argument list lives in (`@syntax role
 * argument-list`, see {@link readArguments}).
 *
 * The language is not written here. It is a spec `logic/specs` registers — for
 * forallx that is `logic/theories/forallx-calgary.mm0`, the same file the
 * proof exercises name as their theory — an ordinary MM0 signature with
 * `@syntax` annotations, read by `@aufbau/syntax`; this module only converts
 * what that parser returns into the {@link Formula} tree the two types
 * evaluate, and writes one back out. The notation table, the precedence
 * ladder, the bracket conventions and the refusals all live in the spec, which
 * is quite literally the same artifact a proof exercise's `system=` names.
 *
 * DOM-free and imported by BOTH the worker (to compile an exercise and grade
 * authoritatively) and the client elements (for the local Check), so it must
 * not reach for any platform globals. The spec arrives as a text import, so
 * this costs the browser bundle the spec's own source and nothing else — no
 * fetch, and the same reading on both sides.
 *
 * Two grammar choices still worth stating, because they surprise people and
 * are now the spec's doing rather than this file's:
 *
 *   - **A quantifier's scope is a single primary**, not the rest of the
 *     formula. `AxF(x) -> G(a)` is `(AxF(x)) -> G(a)`; to quantify over the
 *     conditional you write `Ax(F(x) -> G(a))`. Negation scopes the same way.
 *   - `/\` and `\/` share a precedence rung, so `P /\ Q \/ R` is `(P /\ Q) \/ R`
 *     by left association — not because conjunction binds tighter, which it
 *     does not.
 *   - **The conditionals join nothing unbracketed.** forallx marks `->` and
 *     `<->` non-associative on that same one rung, so `P -> Q -> R`,
 *     `P -> Q <-> R` and `P /\ Q -> R` are all errors rather than readings.
 *     That is the spec's `@syntax forbid chain mix nest`, not a precedence:
 *     the rungs are what the engine parses this file's own math strings by.
 */

import type {
  AppTerm,
  SurfaceLanguage,
  Term as SurfaceTerm,
  TermInfo,
} from "@aufbau/syntax";
import { printTerm, unfoldDefinitions } from "@aufbau/syntax";
import type { BinaryConnective } from "../../logic/specs/connectives";
import {
  binaryConnectiveForRole,
  roleForBinaryConnective,
} from "../../logic/specs/connectives";
import type { FormulaParseError } from "../../logic/specs/diagnostics";
import { formulaParseErrors } from "../../logic/specs/diagnostics";
import {
  argumentListSort,
  individualSorts,
  roleIndex,
  sentenceSort,
} from "../../logic/specs/roles";

export type { BinaryConnective };

/**
 * A term: a variable, an individual constant, or a function symbol applied to
 * terms. `name` is the constructor's name in the spec — for a lexicon letter
 * its spelling, for a notated symbol (`plus`, written `+`) the name behind the
 * notation — which is how a model keys it, and how the printer finds the
 * notation to show it back through.
 */
export type Term =
  | { readonly type: "variable"; readonly name: string }
  | { readonly type: "constant"; readonly name: string }
  | {
      readonly type: "function";
      readonly name: string;
      readonly args: readonly Term[];
    };

/**
 * A formula. A `predicate` with no arguments is a sentence letter — one node
 * type rather than two, because a model interprets them the same way (by
 * symbol and arity) and the field list only needs the arity to tell a
 * True/False select from an extension.
 */
export type Formula =
  | {
      readonly type: "predicate";
      readonly name: string;
      readonly args: readonly Term[];
    }
  | { readonly type: "identity"; readonly left: Term; readonly right: Term }
  | { readonly type: "falsum" }
  | { readonly type: "verum" }
  | { readonly type: "not"; readonly operand: Formula }
  | {
      readonly type: BinaryConnective;
      readonly left: Formula;
      readonly right: Formula;
    }
  | {
      readonly type: "forall" | "exists";
      readonly variable: string;
      readonly body: Formula;
    };

export type ParseError = FormulaParseError;

export type ParseResult =
  | {
      readonly ok: true;
      readonly formula: Formula;
      /**
       * The formula as engine text — MM0's own spelling, which is what an
       * exercise stores. It depends on the language's declarations and on
       * nothing in its `@syntax` display conventions, and the library
       * guarantees it reads back as the same tree ({@link parseEngineFormula}).
       */
      readonly engine: string;
    }
  | { readonly ok: false; readonly errors: readonly ParseError[] };

/**
 * A spec node this module cannot read as a formula, carrying the complaint it
 * will be reported as.
 *
 * The detail travels with the throw because the two ways to get here want
 * different sentences, and unlike the truth table's this one is reachable by a
 * *student*: the translation widget parses what is typed into it with this
 * module, so a language carrying a construct these types cannot evaluate has to
 * name it rather than say only that something went wrong.
 */
class Unreadable extends Error {
  constructor(readonly detail: FormulaParseError) {
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
 * The language has this construct and these types have no reading for it.
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
 * Whether a role-less constructor has an ordinary first-order reading: a
 * function or predicate symbol applied to individuals.
 *
 * Read off the declaration, not the notation. Every binder must be a plain
 * argument — a bound-variable slot `{x: var}` is not one, whatever its sort —
 * at a sort that is, or coerces into, an `@syntax role individual` sort, or
 * at the argument-list sort, whose nodes flatten into such arguments. A
 * sentence-sorted binder fails: `term box (p: wff): wff` with no role, or a
 * conditional term `ite (p: wff) (x y: tm): tm`, has no value a finite model
 * assigns, and reading either as a symbol over its arguments would turn a
 * sentence into a term without a word. A spec that names no individual sort
 * interprets no symbol with arguments at all, which is the honest reading of
 * a declaration that said nothing.
 */
function firstOrderSignature(node: AppTerm, lang: SurfaceLanguage): boolean {
  return hasFirstOrderSignature(node.term, lang);
}

/**
 * Whether a constructor, by name, has the ordinary first-order reading
 * {@link firstOrderSignature} describes. Exported for the consumers that check
 * a spec's declarations before any formula is written in it — a world type
 * refusing a `blocks.*` role on a constructor it could never read, say.
 */
export function hasFirstOrderSignature(
  term: string,
  lang: SurfaceLanguage,
): boolean {
  const info = lang.spec.terms.get(term);

  if (info === undefined) {
    return false;
  }

  const list = argumentListSort(lang);
  const individuals = individualSorts(lang);
  const individual = (sort: string): boolean =>
    individuals.some(
      (target) => sort === target || lang.coerce(sort, target) !== null,
    );

  return info.binders.every(
    (binder) =>
      !binder.binds &&
      "sort" in binder.type &&
      (binder.type.sort === list || individual(binder.type.sort)),
  );
}

/** Strip the coercion wrappers the parser inserts between sorts. */
function bare(node: SurfaceTerm, lang: SurfaceLanguage): SurfaceTerm {
  let current = node;

  while (
    current.kind === "app" &&
    lang.coercionNames.has(current.term) &&
    current.args.length === 1
  ) {
    const inner = current.args[0];

    if (inner === undefined) {
      break;
    }

    current = inner;
  }

  return current;
}

/**
 * The argument list of a symbol, from every one of its binders.
 *
 * A symbol of fixed arity — `plus (x y: tm)`, `Red (x: tm)` — contributes one
 * argument per binder, however its notation is written: `x + y`, `Red(a)` and
 * a general notation all arrive here as the same tree. A textbook's variadic
 * letters take a single binder at the spec's `@syntax role argument-list`
 * sort, and a node of that sort is flattened *by structure*: each of its own
 * binders at the list sort recurses, each at any other sort is one argument.
 * That reads an elided nil as nothing, a comma or juxtaposition as
 * concatenation, and a cons-style list just as well, so the reader knows no
 * constructor's name. A spec without the role has no lists, and every binder
 * is one argument.
 */
function readArguments(
  args: readonly SurfaceTerm[],
  lang: SurfaceLanguage,
): Term[] {
  const list = argumentListSort(lang);
  const terms: Term[] = [];

  const visit = (node: SurfaceTerm): void => {
    const inner = bare(node, lang);

    if (list !== undefined && inner.kind === "app" && inner.sort === list) {
      for (const argument of inner.args) {
        visit(argument);
      }

      return;
    }

    terms.push(readTerm(inner, lang));
  };

  for (const argument of args) {
    visit(argument);
  }

  return terms;
}

function readTerm(node: SurfaceTerm, lang: SurfaceLanguage): Term {
  const inner = bare(node, lang);

  // A lexicon token of a sort no quantifier binds is a proper name, not a
  // variable. forallx: Calgary draws the two from separate `@vars` pools —
  // `a`–`e` at `name`, `s`–`z` at `var` — because its proof system needs the
  // eigenvariable provisos to be MM0 dependency typing rather than a side
  // condition, and a name is precisely what cannot be captured.
  if (inner.kind === "variable") {
    return lang.bindableSorts.has(inner.sort)
      ? { name: inner.name, type: "variable" }
      : { name: inner.name, type: "constant" };
  }

  if (!firstOrderSignature(inner, lang)) {
    throw uninterpretable(inner, lang, roleIndex(lang).roleOf(inner.term));
  }

  const args = readArguments(inner.args, lang);

  return args.length === 0
    ? { name: inner.term, type: "constant" }
    : { args, name: inner.term, type: "function" };
}

function binder(node: SurfaceTerm): string {
  if (node.kind !== "variable") {
    throw malformed();
  }

  return node.name;
}

function operand(
  node: SurfaceTerm | undefined,
  lang: SurfaceLanguage,
): Formula {
  if (node === undefined) {
    throw malformed();
  }

  return readFormula(node, lang);
}

function operandTerm(
  node: SurfaceTerm | undefined,
  lang: SurfaceLanguage,
): Term {
  if (node === undefined) {
    throw malformed();
  }

  return readTerm(node, lang);
}

/**
 * One parsed node as a formula, dispatched on its `@syntax role`.
 *
 * A constructor with no role at all is a predicate symbol — a lexicon letter
 * `F`, `P`, or a declared `Red (x: tm): wff` under whatever notation it has —
 * and its arguments are read from every binder ({@link readArguments}). That
 * is the whole of the open-ended half of the language: everything else is a
 * fixed handful of connectives the spec names.
 */
function readFormula(node: SurfaceTerm, lang: SurfaceLanguage): Formula {
  const inner = bare(node, lang);

  if (inner.kind === "variable") {
    throw malformed();
  }

  const role = roleIndex(lang).roleOf(inner.term);

  switch (role) {
    case null:
      if (!firstOrderSignature(inner, lang)) {
        throw uninterpretable(inner, lang, role);
      }

      return {
        args: readArguments(inner.args, lang),
        name: inner.term,
        type: "predicate",
      };
    case "negation":
      return { operand: operand(inner.args[0], lang), type: "not" };
    case "forall":
    case "exists":
      return {
        body: operand(inner.args[1], lang),
        type: role,
        variable: binder(inner.args[0] ?? inner),
      };
    case "identity":
      return {
        left: operandTerm(inner.args[0], lang),
        right: operandTerm(inner.args[1], lang),
        type: "identity",
      };
    // `≠` is a `def` over negation and identity, and unfolding it here is what
    // keeps the {@link Formula} union free of a node whose only content is
    // that the writer used the shorter spelling. The evaluator and the MM0
    // emitter see `¬a=b` either way, and the printer writes it back as the
    // negated identity it is, `¬a = b`.
    case "inequality":
      return {
        operand: {
          left: operandTerm(inner.args[0], lang),
          right: operandTerm(inner.args[1], lang),
          type: "identity",
        },
        type: "not",
      };
    case "falsum":
      return { type: "falsum" };
    case "verum":
      return { type: "verum" };
    // Every binary role through one lookup: a connective's whole content here
    // is the truth function it computes, and all sixteen of those live in
    // `logic/specs/connectives.ts`. Only the roles that are *not* truth
    // functions of two sentences are worth a case.
    default: {
      const connective = binaryConnectiveForRole(role);

      if (connective === null) {
        throw uninterpretable(inner, lang, role);
      }

      return {
        left: operand(inner.args[0], lang),
        right: operand(inner.args[1], lang),
        type: connective,
      };
    }
  }
}

/**
 * Parse one term at the spec's individual sort — a name an author gives an
 * object, say — collecting every syntax error it has.
 */
export function parseTerm(
  source: string,
  lang: SurfaceLanguage,
):
  | { readonly ok: true; readonly term: Term }
  | { readonly ok: false; readonly errors: readonly ParseError[] } {
  const sort = individualSorts(lang)[0];

  if (sort === undefined) {
    return {
      errors: [{ message: "This formula could not be read.", position: 0 }],
      ok: false,
    };
  }

  const result = lang.parse(source, { sort });

  if (!result.ok) {
    return { errors: formulaParseErrors(result.diagnostics), ok: false };
  }

  try {
    return { ok: true, term: readTerm(result.term, lang) };
  } catch (error) {
    if (error instanceof Unreadable) {
      return { errors: [error.detail], ok: false };
    }

    throw error;
  }
}

/** A parse turned into a formula and its engine text, or the complaints. */
function readParse(
  result: ReturnType<SurfaceLanguage["parse"]>,
  lang: SurfaceLanguage,
): ParseResult {
  if (!result.ok) {
    return { errors: formulaParseErrors(result.diagnostics), ok: false };
  }

  try {
    return {
      engine: printTerm(lang, result.term, "engine"),
      formula: readFormula(result.term, lang),
      ok: true,
    };
  } catch (error) {
    if (error instanceof Unreadable) {
      return { errors: [error.detail], ok: false };
    }

    throw error;
  }
}

/** Parse one first-order formula, collecting every syntax error it has. */
export function parseFormula(
  source: string,
  lang: SurfaceLanguage,
): ParseResult {
  const sort = sentenceSort(lang);

  return readParse(
    lang.parse(source, sort === undefined ? {} : { sort }),
    lang,
  );
}

/**
 * Read back a formula an exercise stored: the engine text
 * {@link parseFormula} gave it.
 *
 * Without the spec's lints, which are conventions about what a person may
 * type and were applied when the author's text was first read — and a model
 * exercise's formulas may be open on purpose.
 */
export function parseEngineFormula(
  engine: string,
  lang: SurfaceLanguage,
): ParseResult {
  const sort = sentenceSort(lang);

  return readParse(
    lang.parse(engine, {
      lints: false,
      mode: "engine",
      ...(sort === undefined ? {} : { sort }),
    }),
    lang,
  );
}

/**
 * Engine text with every def unfolded: the one spelling a formula has as the
 * engine sees it, so two formulas are the same tree — `a ≠ b` and `¬a = b`
 * included — exactly when these are equal. The printer's round-trip law is
 * what makes the text a faithful stand-in for the tree. `null` when the text
 * does not read.
 */
export function unfoldedEngineText(
  engine: string,
  lang: SurfaceLanguage,
): string | null {
  const sort = sentenceSort(lang);
  const parsed = lang.parse(engine, {
    lints: false,
    mode: "engine",
    ...(sort === undefined ? {} : { sort }),
  });

  return parsed.ok
    ? printTerm(lang, unfoldDefinitions(lang, parsed.term), "engine")
    : null;
}

/**
 * A formula with the span of source text it was read from, and its immediate
 * subformulas the same way — what lets a reader point at part of a written
 * sentence and ask what that part says.
 */
export interface FormulaNode {
  readonly children: readonly FormulaNode[];
  readonly end: number;
  readonly formula: Formula;
  readonly start: number;
}

/**
 * Parse a formula and keep the tree of its subformulas with their spans.
 *
 * Every sentence-sorted node of the parse is one subformula, read with the
 * same reader {@link parseFormula} uses; terms inside it are not nodes of
 * their own. The parse runs without the spec's lints, because the parts of a
 * closed sentence are open formulas (`LeftOf(y,x)` inside `∀x∃yLeftOf(y,x)`),
 * and a part is exactly what this is for. `null` when the whole does not read.
 */
export function parseFormulaTree(
  source: string,
  lang: SurfaceLanguage,
): FormulaNode | null {
  const sort = sentenceSort(lang);
  const result = lang.parse(
    source,
    sort === undefined ? { lints: false } : { lints: false, sort },
  );

  if (!result.ok) {
    return null;
  }

  const sentence = sort ?? lang.provableSort;

  const collect = (node: SurfaceTerm): FormulaNode[] => {
    const inner = bare(node, lang);

    if (inner.kind === "variable") {
      return [];
    }

    if (inner.sort === sentence) {
      try {
        return [
          {
            children: inner.args.flatMap(collect),
            end: inner.span.end,
            formula: readFormula(inner, lang),
            start: inner.span.start,
          },
        ];
      } catch (error) {
        if (error instanceof Unreadable) {
          return [];
        }

        throw error;
      }
    }

    return inner.args.flatMap(collect);
  };

  return collect(result.term)[0] ?? null;
}

/**
 * A node as the printer reads it. Where a node stood in the source, and how it
 * was spelled there, are a parse's to record; a tree built to be printed has
 * neither, and `printTerm` asks for neither.
 */
function node(
  term: string,
  sort: string,
  args: readonly SurfaceTerm[],
): AppTerm {
  return {
    args,
    fixity: null,
    grouped: false,
    kind: "app",
    prec: null,
    sort,
    span: { end: 0, start: 0 },
    term,
    token: null,
  };
}

/**
 * A tree this module was asked to build that the parser could never have
 * produced: a formula from somewhere other than this language, which is a
 * caller's bug. Thrown rather than printed as something plausible.
 */
function unwritable(detail: string): Error {
  return new Error(
    `This formula cannot be written in this language: ${detail}`,
  );
}

/**
 * A node read at `sort`, inside the coercions the parser would have put
 * around it there — `F(x)` is `F` over `t2s(v2t(x))` in forallx. The printer
 * writes a coercion as nothing, but reads the sort it lands on: that is how it
 * knows an argument list is juxtaposed, or a formula outermost.
 */
function coerced(
  term: SurfaceTerm,
  sort: string,
  lang: SurfaceLanguage,
): SurfaceTerm {
  const path = lang.coerce(term.sort, sort);

  if (path === null) {
    throw unwritable(`nothing takes ${term.sort} to ${sort}.`);
  }

  return path.reduce<SurfaceTerm>((inner, name) => {
    const coercion = lang.spec.coercions.find((each) => each.name === name);

    if (coercion === undefined) {
      throw unwritable(`${name} is not a coercion.`);
    }

    return node(name, coercion.to, [inner]);
  }, term);
}

/**
 * A constructor applied to argument trees, each read at its binder's sort.
 */
function applied(
  info: TermInfo,
  args: readonly SurfaceTerm[],
  lang: SurfaceLanguage,
): AppTerm {
  if (args.length !== info.binders.length) {
    throw unwritable(
      `${info.name} takes ${info.binders.length} arguments, not ${args.length}.`,
    );
  }

  return node(
    info.name,
    info.returnSort,
    args.map((arg, at) => {
      const type = info.binders[at]?.type;

      return type !== undefined && "sort" in type
        ? coerced(arg, type.sort, lang)
        : arg;
    }),
  );
}

/** The constructor a spec gives a role, for a formula that needs it written. */
function constructorFor(role: string, lang: SurfaceLanguage): TermInfo {
  const term = roleIndex(lang).termFor(role);
  const info = term === null ? undefined : lang.spec.terms.get(term);

  if (info === undefined) {
    throw unwritable(`it has no constructor for ${role}.`);
  }

  return info;
}

/**
 * The sort whose `@vars` pool holds a name: a bindable one for a variable, any
 * other for a constant drawn from a pool (forallx's `a`–`e`, UBC's `a₁`).
 *
 * A variable in no pool stands at the first bindable sort. That is the `_` a
 * model's blanked label is written with: a placeholder, not a name, and the
 * printer writes a variable as its name whatever its sort. A constant in no
 * pool is not one this language could have read.
 */
function poolSort(
  name: string,
  bindable: boolean,
  lang: SurfaceLanguage,
): string {
  for (const info of lang.spec.sorts.values()) {
    if (
      lang.bindableSorts.has(info.name) === bindable &&
      info.vars.includes(name)
    ) {
      return info.name;
    }
  }

  const fallback = bindable ? [...lang.bindableSorts][0] : undefined;

  if (fallback === undefined) {
    throw unwritable(`“${name}” is not one of its names.`);
  }

  return fallback;
}

function variable(name: string, sort: string, binds: boolean): SurfaceTerm {
  return {
    binder: binds,
    grouped: false,
    kind: "variable",
    name,
    sort,
    span: { end: 0, start: 0 },
  };
}

/**
 * Individuals as one argument list, the inverse of {@link readArguments}: the
 * spec's elided term for none, and otherwise the elements joined left to right
 * by the list sort's combiner — its `@syntax juxtaposed` term where it has one
 * (Magnus's `Rab`), else the one constructor joining two lists (Calgary's
 * comma). Left-nested, because that is the tree the parser builds and the one
 * the printer flattens back into `Rab` or `R(a,b)`.
 */
function argumentList(
  items: readonly SurfaceTerm[],
  list: string,
  lang: SurfaceLanguage,
): SurfaceTerm {
  const elements = items.map((item) => coerced(item, list, lang));
  const [first, ...rest] = elements;

  if (first === undefined) {
    const nil = lang.elidedOf.get(list);

    if (nil === undefined) {
      throw unwritable(`it has no empty ${list}.`);
    }

    return node(nil.name, list, []);
  }

  if (rest.length === 0) {
    return first;
  }

  const join =
    lang.juxtaposedOf.get(list) ??
    [...lang.spec.terms.values()].find(
      (info) =>
        info.returnSort === list &&
        info.binders.length === 2 &&
        info.binders.every(
          (binder) =>
            !binder.binds &&
            "sort" in binder.type &&
            binder.type.sort === list,
        ),
    );

  if (join === undefined) {
    throw unwritable(`it has no way to join two ${list}s.`);
  }

  return rest.reduce<SurfaceTerm>(
    (left, right) => node(join.name, list, [left, right]),
    first,
  );
}

/**
 * A symbol applied to individuals, as the parser would have read it: one
 * argument per binder, except that a binder at the argument-list sort takes
 * whatever the binders around it leave — all of them, for a textbook's
 * variadic letter. {@link readArguments} flattens every such binder, so a
 * symbol with two could be read from more than one tree, and is refused.
 */
function application(
  name: string,
  args: readonly Term[],
  lang: SurfaceLanguage,
): AppTerm {
  const info = lang.spec.terms.get(name);

  if (info === undefined) {
    throw unwritable(`“${name}” is not one of its constructors.`);
  }

  const list = argumentListSort(lang);
  const terms = args.map((arg) => termTree(arg, lang));
  const lists = info.binders.flatMap((binder, at) =>
    "sort" in binder.type && binder.type.sort === list ? [at] : [],
  );
  const [at, ...more] = lists;

  if (list === undefined || at === undefined) {
    return applied(info, terms, lang);
  }

  if (more.length > 0) {
    throw unwritable(`${name} takes more than one argument list.`);
  }

  const after = info.binders.length - at - 1;

  if (terms.length < at + after) {
    throw unwritable(
      `${name} takes at least ${at + after} arguments, not ${terms.length}.`,
    );
  }

  return applied(
    info,
    [
      ...terms.slice(0, at),
      argumentList(terms.slice(at, terms.length - after), list, lang),
      ...terms.slice(terms.length - after),
    ],
    lang,
  );
}

function termTree(term: Term, lang: SurfaceLanguage): SurfaceTerm {
  switch (term.type) {
    case "variable":
      return variable(term.name, poolSort(term.name, true, lang), false);
    case "function":
      return application(term.name, term.args, lang);
    case "constant":
      // A constant is a nullary constructor (`zero`) or a name from a pool.
      return lang.spec.terms.has(term.name)
        ? application(term.name, [], lang)
        : variable(term.name, poolSort(term.name, false, lang), false);
  }
}

/**
 * A formula as the tree `@aufbau/syntax` would parse it to: the inverse of
 * {@link readFormula}, taking each constructor from the role the spec gives
 * it. This is what lets one printer — the library's — write every formula,
 * whether it was read from text or built by an exercise type.
 */
function formulaTree(formula: Formula, lang: SurfaceLanguage): AppTerm {
  const apply = (role: string, args: readonly SurfaceTerm[]): AppTerm =>
    applied(constructorFor(role, lang), args, lang);

  switch (formula.type) {
    case "predicate":
      return application(formula.name, formula.args, lang);
    case "identity":
      return apply("identity", [
        termTree(formula.left, lang),
        termTree(formula.right, lang),
      ]);
    case "falsum":
    case "verum":
      return apply(formula.type, []);
    case "not":
      return apply("negation", [formulaTree(formula.operand, lang)]);
    case "forall":
    case "exists": {
      const bound = constructorFor(formula.type, lang).binders[0];

      if (bound?.binds !== true || !("sort" in bound.type)) {
        throw unwritable(`its ${formula.type} binds no variable first.`);
      }

      return apply(formula.type, [
        variable(formula.variable, bound.type.sort, true),
        formulaTree(formula.body, lang),
      ]);
    }
    default:
      return apply(roleForBinaryConnective(formula.type), [
        formulaTree(formula.left, lang),
        formulaTree(formula.right, lang),
      ]);
  }
}

/** Render a term back to source, in the spec's own notation. */
export function termToString(term: Term, lang: SurfaceLanguage): string {
  return printTerm(lang, termTree(term, lang), "display");
}

/**
 * A formula as a reader is shown it, by `@aufbau/syntax`'s display printer:
 * the spec's canonical spelling of every symbol, every binary compound
 * bracketed (Carnap's convention) bar the outermost where the spec drops it,
 * arguments juxtaposed where the spec juxtaposes them, and text the language
 * reads back.
 *
 * Display only. What an exercise stores is engine text
 * ({@link ParseResult}'s `engine`), which leaves this printer free to follow
 * the textbook's conventions without anything depending on its output.
 */
export function formulaToString(
  formula: Formula,
  lang: SurfaceLanguage,
): string {
  return printTerm(lang, formulaTree(formula, lang), "display");
}
