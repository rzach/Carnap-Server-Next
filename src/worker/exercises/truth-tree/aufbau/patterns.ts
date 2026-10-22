/**
 * A rule statement's terms as patterns over a tree's rows (gh #46).
 *
 * The development criteria ask which rows a rule applies to, and a closed
 * branch's × which rows close it: both are questions about a rule's focus
 * pattern (`∀ x ph`, `ph ; ¬ ph`) against a row's term. A rule's binders are
 * its metavariables, and anything else must be the same constructor with
 * matching arguments.
 *
 * A row is matched in its canonical form: its defs unfolded, then normalized
 * by the theory's rewrites and `@acui` laws as far as the engine can prove
 * (`@aufbau/syntax`'s `engineForm`), so `a ≠ a` is the `¬ te = te` a closure
 * rule asks for. A pattern no term of which heads a `@rewrite` once its defs
 * are unfolded is *rigid*: computing an instance of it only computes inside
 * what its metavariables stand for, so it matches a row exactly where it
 * matches the row's canonical form syntactically (#478). The closure rules'
 * rows and the rows each rule develops must be rigid (`./criteria.ts` says
 * where one is not), since an open branch is decided by them.
 *
 * A term that heads a rewrite is computed away (`{x / a} ph` becomes `ph`
 * with `a` for `x`), so no row has the shape of a pattern built with one. A
 * rule whose rows are stated so says, for the engine, how it reads them: a
 * `@view` whose rows are rigid (`a = b ; ps`), and an `@abstract` that builds
 * what the view leaves unread (`ph`) from a row it matched. Carnap matches
 * such a rule by its view and builds the rest as the engine does
 * ({@link abstracted}).
 *
 * The one computation matching does itself is a list: a constructor the
 * theory declares associative with a unit and nothing more (`@acui assoc _
 * unit _`), as the intuitionistic tableaux' prefixes are. A term of it is the
 * sequence of its members, so `(1 . wa) . waa` and `1 . (wa . waa)` are one
 * term, and a metavariable of the list's sort in a pattern stands for any run
 * of members, none included: `σ . ρ` is `σ` and every prefix that extends it.
 *
 * Instantiating is the converse, and the engine checks what it produces: a
 * link theorem (`./emit.ts`) states a written row is a rule's template with
 * the instance filled in.
 *
 * DOM-free and free of i18n.
 */

import type {
  AssertStatement,
  SurfaceLanguage,
  Term,
  VariableTerm,
} from "@aufbau/syntax";
import {
  abstractContext,
  engineForm,
  parseStatement,
  printTerm,
  RewriteLimitError,
  substitute,
  unfoldDefinitions,
} from "@aufbau/syntax";

/** What each metavariable of a pattern stands for. */
export type Bindings = ReadonlyMap<string, Term>;

/**
 * A pattern's metavariables, each with whether it is bound (`{n: pfx}`): a
 * bound one stands only for a variable, as the engine instantiates it.
 */
export type Metas = ReadonlyMap<string, boolean>;

/** A rule statement's terms, as patterns. */
export interface RulePatterns {
  /** The statement's name: the axiom. */
  readonly name: string;
  /** The rows the rule develops, at the row sort; one for most rules. */
  readonly focus: readonly Term[];
  /**
   * Rows the rule asks the branch to hold beside the ones it develops, which
   * the student does not cite: a witness, as `□𝕋`'s row at the prefix it goes
   * to witnesses that the prefix is used. Usually none.
   */
  readonly side: readonly Term[];
  /** The rows each premise writes onto its branch, beyond the branch. */
  readonly written: readonly (readonly Term[])[];
  /**
   * The check marks each premise writes beside them (`tree.mark`,
   * `tree.mark.instance`), which are not rows: no student types one.
   */
  readonly marks: readonly (readonly Term[])[];
  /** The branch metavariable: the rest of the branch (`ga`). */
  readonly branch: string;
  /** The statement's binders: its metavariables. */
  readonly metas: Metas;
  readonly binders: AssertStatement["binders"];
  /** How its rows are read where its rewrites compute them; usually null. */
  readonly abstraction: Abstraction | null;
}

/**
 * A rule's `@view` and `@abstract target left right hole plug other`, with
 * bare-name plugs: the rows are matched by the view, and `target` is `left`
 * with each site of `plug` made `hole`.
 */
export interface Abstraction {
  /** The view as patterns, named for the rule: what rows are matched by. */
  readonly view: RulePatterns;
  readonly target: string;
  readonly left: string;
  readonly hole: string;
  readonly plug: string;
  readonly other: string;
}

/** A list constructor: associative, with a unit, neither commutative nor idempotent. */
interface List {
  readonly term: string;
  readonly unit: string;
}

const listCache = new WeakMap<SurfaceLanguage, ReadonlyMap<string, List>>();

/** The theory's list constructors, by the sort they build. */
function listsOf(language: SurfaceLanguage): ReadonlyMap<string, List> {
  let lists = listCache.get(language);

  if (lists === undefined) {
    const found = new Map<string, List>();

    for (const info of language.spec.terms.values()) {
      const acui = info.acui;

      if (acui !== null && acui.comm === null && acui.idem === null) {
        found.set(info.returnSort, { term: info.name, unit: acui.unit });
      }
    }

    lists = found;
    listCache.set(language, lists);
  }

  return lists;
}

/** Whether a term is built by the list itself: its constructor, or its unit. */
function isListed(list: List, term: Term): boolean {
  return (
    term.kind === "app" &&
    (term.term === list.term ||
      (term.term === list.unit && term.args.length === 0))
  );
}

/** A list's members, in order, its unit left out: one member for any other term. */
function members(list: List, term: Term): Term[] {
  if (!isListed(list, term)) {
    return [term];
  }

  return term.kind === "app" && term.term === list.term
    ? term.args.flatMap((argument) => members(list, argument))
    : [];
}

/** A list of `members`, nested to the left as the parser reads it: `1 . wa . waa`. */
function listOf(
  language: SurfaceLanguage,
  list: List,
  terms: readonly Term[],
): Term {
  const [first, ...rest] = terms;

  return first === undefined
    ? language.app(list.unit, [])
    : rest.reduce<Term>(
        (left, right) => language.app(list.term, [left, right]),
        first,
      );
}

/** Each term read, with its defs unfolded; a term belongs to one language. */
const unfoldings = new WeakMap<Term, Term>();

/** A term with its defs unfolded, once per term. */
function unfolded(language: SurfaceLanguage, term: Term): Term {
  let found = unfoldings.get(term);

  if (found === undefined) {
    found = unfoldDefinitions(language, term);
    unfoldings.set(term, found);
  }

  return found;
}

/** Each term read, in canonical form. */
const canonicals = new WeakMap<Term, Term>();

/**
 * A term in canonical form: its defs unfolded, then as the engine compares
 * it (`engineForm`): the normal form of the theory's rewrites and `@acui`
 * laws where the engine can prove its way there, and the term as written
 * where it cannot, as under a term with no `@congr`, or where the rewrites
 * do not terminate.
 */
export function canonical(language: SurfaceLanguage, term: Term): Term {
  let found = canonicals.get(term);

  if (found === undefined) {
    const plain = unfolded(language, term);

    try {
      found = engineForm(language, plain);
    } catch (error) {
      if (!(error instanceof RewriteLimitError)) {
        throw error;
      }

      found = plain;
    }

    canonicals.set(term, found);
    canonicals.set(found, found);
  }

  return found;
}

const headCache = new WeakMap<SurfaceLanguage, ReadonlySet<string>>();

/**
 * The terms that head a `@rewrite`'s left side: the ones the engine computes
 * away, as `{x / te} ph` is. A rewrite is a statement so annotated with no
 * hypotheses, stating its relation between two terms.
 */
export function rewriteHeads(language: SurfaceLanguage): ReadonlySet<string> {
  let heads = headCache.get(language);

  if (heads === undefined) {
    const found = new Set<string>();

    for (const statement of language.spec.statements) {
      if (
        (statement.kind !== "axiom" && statement.kind !== "theorem") ||
        statement.hypotheses.some((hypothesis) => "text" in hypothesis) ||
        statement.binders.some((binder) => "text" in binder.type) ||
        !statement.annotations.some(
          (annotation) =>
            annotation.text.trim().split(/\s+/)[0] === "@rewrite",
        )
      ) {
        continue;
      }

      const read = parseStatement(language, statement).conclusion.result;
      const left =
        read.ok && read.term.kind === "app"
          ? (read.term.args[0] ?? null)
          : null;

      // Under the def it is headed by too: a pattern is looked at unfolded.
      for (const head of left === null
        ? []
        : [left, unfolded(language, left)]) {
        if (head.kind === "app") {
          found.add(head.term);
        }
      }
    }

    heads = found;
    headCache.set(language, heads);
  }

  return heads;
}

/**
 * The first term in a pattern, its defs unfolded, that heads a rewrite; null
 * where there is none, and the pattern is rigid: matching it against a row's
 * canonical form is then exact.
 */
export function computedTerm(
  language: SurfaceLanguage,
  pattern: Term,
): string | null {
  const heads = rewriteHeads(language);
  const find = (node: Term): string | null => {
    if (node.kind === "variable") {
      return null;
    }

    if (heads.has(node.term)) {
      return node.term;
    }

    for (const argument of node.args) {
      const found = find(argument);

      if (found !== null) {
        return found;
      }
    }

    return null;
  };

  return find(unfolded(language, pattern));
}

/**
 * A variable of `sort` named nowhere in `term`: `x0`, `x1`, …, which no
 * pool holds, so that it cannot be mistaken for a row's own variable; the
 * engine is told a pool token in its place (`pairBindings`).
 */
function freshVariable(
  language: SurfaceLanguage,
  name: string,
  sort: string,
  term: Term,
): VariableTerm {
  const names = new Set<string>();
  const collect = (node: Term): void => {
    if (node.kind === "variable") {
      names.add(node.name);
    } else {
      node.args.forEach(collect);
    }
  };

  collect(term);

  let at = 0;

  while (names.has(`${name}${at}`)) {
    at += 1;
  }

  return language.variable(`${name}${at}`, sort);
}

/** The patterns a rule's rows are matched by: its view's, where it abstracts. */
export function matchedBy(patterns: RulePatterns): RulePatterns {
  return patterns.abstraction?.view ?? patterns;
}

/**
 * A rule's bindings from its view's (`a`, `b`, `ps`), as the engine's
 * `@abstract` builds them (`abstractContext`): the view's binders that are
 * the rule's, the hole a variable named nowhere in `left`, and the target
 * `left` with every site of the plug made the hole (`ps` `F a ∧ G a`, plug
 * `a`, is `ph` `F x ∧ G x`; `a` sits in a term as `n2t a`, and the hole
 * goes in as `v2t x`). Null where there is no site, where the rewrites the
 * walk's retry normalizes by do not terminate, or where the rule's rows so
 * filled in are not the view's.
 */
export function abstracted(
  language: SurfaceLanguage,
  patterns: RulePatterns,
  bindings: Bindings,
): Bindings | null {
  const abstraction = patterns.abstraction;

  if (abstraction === null) {
    return bindings;
  }

  const { view } = abstraction;
  const left = bindings.get(abstraction.left);
  const plug = bindings.get(abstraction.plug);
  const other = bindings.get(abstraction.other);
  const declared = patterns.binders.find(
    (binder) => binder.name === abstraction.hole,
  );

  if (
    left === undefined ||
    plug === undefined ||
    other === undefined ||
    declared === undefined ||
    !("sort" in declared.type)
  ) {
    return null;
  }

  const hole = freshVariable(
    language,
    abstraction.hole,
    declared.type.sort,
    left,
  );
  let target: Term | null;

  try {
    target = abstractContext(language, {
      hole,
      left,
      leftPlug: plug,
      rightPlug: other,
    });
  } catch (error) {
    // The engine refuses the line there, as rules that do not terminate.
    if (!(error instanceof RewriteLimitError)) {
      throw error;
    }

    target = null;
  }

  if (target === null) {
    return null;
  }

  const found = new Map([
    ...[...bindings].filter(([meta]) => patterns.metas.has(meta)),
    [abstraction.target, target],
    [abstraction.hole, hole],
  ]);
  const agrees =
    patterns.focus.length === view.focus.length &&
    patterns.focus.every(
      (row, at) =>
        termKey(language, substitute(row, found)) ===
        termKey(language, substitute(view.focus[at] as Term, bindings)),
    );

  return agrees ? found : null;
}

/**
 * A term's engine text in canonical form: one spelling for every term the
 * engine computes to the same, for identity.
 */
export function termKey(language: SurfaceLanguage, term: Term): string {
  return printTerm(language, canonical(language, term), "engine");
}

/**
 * Match `pattern` against `term`, extending `bindings`; null where they do
 * not match. A metavariable bound twice must stand for the same term both
 * times (`¬ te = te`). Where a list lets them match more than one way, the
 * first of {@link matchAll}'s.
 */
export function matchTerm(
  language: SurfaceLanguage,
  pattern: Term,
  term: Term,
  metas: Metas,
  bindings: Bindings = new Map(),
): Bindings | null {
  for (const found of matchAll(language, pattern, term, metas, bindings)) {
    return found;
  }

  return null;
}

/**
 * Every way `pattern` matches `term`, extending `bindings`. Only a list
 * gives more than one: `σ . ρ` against `1 . wa` is `σ` the unit and `ρ` the
 * whole, `σ` `1` and `ρ` `wa`, and `σ` the whole, so a pattern after it that
 * needs `σ` to be `1` can have it. Each run is tried shortest first.
 *
 * The pattern is matched with its defs unfolded, the term in canonical
 * form, as the engine compares them: `a ≠ a` is the `¬ te = te` a closure
 * rule asks for.
 */
export function* matchAll(
  language: SurfaceLanguage,
  pattern: Term,
  term: Term,
  metas: Metas,
  bindings: Bindings = new Map(),
): Generator<Bindings> {
  yield* matchUnfolded(
    language,
    unfolded(language, pattern),
    canonical(language, term),
    metas,
    bindings,
  );
}

/**
 * {@link matchAll} of a pattern with its defs unfolded against a term in
 * canonical form.
 */
function* matchUnfolded(
  language: SurfaceLanguage,
  pattern: Term,
  term: Term,
  metas: Metas,
  bindings: Bindings,
): Generator<Bindings> {
  if (pattern.kind === "variable" && metas.has(pattern.name)) {
    if (
      pattern.sort !== term.sort ||
      (metas.get(pattern.name) === true && term.kind !== "variable")
    ) {
      return;
    }

    const bound = bindings.get(pattern.name);

    if (bound === undefined) {
      yield new Map([...bindings, [pattern.name, term]]);
      return;
    }

    const key = termKey(language, bound);

    if (key === termKey(language, term)) {
      yield bindings;
    }

    return;
  }

  const list =
    pattern.kind === "app" ? listsOf(language).get(pattern.sort) : undefined;

  // A member that is neither (`t2s a` in a `seq`) is matched as itself below:
  // as a list it is one member, and matching that is this same question.
  if (
    list !== undefined &&
    term.sort === pattern.sort &&
    (isListed(list, pattern) || isListed(list, term))
  ) {
    yield* matchList(
      language,
      list,
      pattern.sort,
      members(list, pattern),
      members(list, term),
      metas,
      bindings,
    );
    return;
  }

  if (pattern.kind === "variable" || term.kind === "variable") {
    if (
      pattern.kind === "variable" &&
      term.kind === "variable" &&
      pattern.name === term.name
    ) {
      yield bindings;
    }

    return;
  }

  if (
    pattern.term !== term.term ||
    pattern.args.length !== term.args.length
  ) {
    return;
  }

  yield* matchEach(language, pattern.args, term.args, metas, bindings);
}

/** Patterns against terms, one for one, every way all of them match. */
function* matchEach(
  language: SurfaceLanguage,
  patterns: readonly Term[],
  terms: readonly Term[],
  metas: Metas,
  bindings: Bindings,
): Generator<Bindings> {
  const [pattern, ...rest] = patterns;

  if (pattern === undefined) {
    yield bindings;
    return;
  }

  for (const found of matchUnfolded(
    language,
    pattern,
    terms[0] as Term,
    metas,
    bindings,
  )) {
    yield* matchEach(language, rest, terms.slice(1), metas, found);
  }
}

/**
 * A list pattern's members against a list's: a metavariable of the list's
 * own sort, not bound, takes a run of members, none included; anything else
 * takes one member.
 */
function* matchList(
  language: SurfaceLanguage,
  list: List,
  sort: string,
  patterns: readonly Term[],
  terms: readonly Term[],
  metas: Metas,
  bindings: Bindings,
): Generator<Bindings> {
  const key = (term: Term): string => termKey(language, term);
  const from = function* (
    at: number,
    taken: number,
    sofar: Bindings,
  ): Generator<Bindings> {
    const pattern = patterns[at];

    if (pattern === undefined) {
      if (taken === terms.length) {
        yield sofar;
      }

      return;
    }

    const run =
      pattern.kind === "variable" &&
      metas.get(pattern.name) === false &&
      pattern.sort === sort;

    if (!run || pattern.kind !== "variable") {
      const next = terms[taken];

      if (next === undefined) {
        return;
      }

      for (const found of matchUnfolded(
        language,
        pattern,
        next,
        metas,
        sofar,
      )) {
        yield* from(at + 1, taken + 1, found);
      }

      return;
    }

    const bound = sofar.get(pattern.name);

    if (bound !== undefined) {
      const owed = members(list, bound);
      const agrees = owed.every(
        (member, offset) =>
          terms[taken + offset] !== undefined &&
          key(member) === key(terms[taken + offset] as Term),
      );

      if (agrees) {
        yield* from(at + 1, taken + owed.length, sofar);
      }

      return;
    }

    for (let end = taken; end <= terms.length; end += 1) {
      yield* from(
        at + 1,
        end,
        new Map([
          ...sofar,
          [pattern.name, listOf(language, list, terms.slice(taken, end))],
        ]),
      );
    }
  };

  yield* from(0, 0, bindings);
}

/**
 * The closed subterms of a sort in a term, by engine text, in the order they
 * first occur: the terms a general rule could have been instantiated with.
 * Closed means no variable in it is bound by a quantifier around it, so the
 * `x` of `∀x Fx` is not one, and the `a` of `Fa` is. Of a list, every run of
 * its members is one, the empty run too: `1 . wa` has `1`, `wa`, `1 . wa`
 * and the unit.
 */
export function closedSubterms(
  language: SurfaceLanguage,
  term: Term,
  sort: string,
): string[] {
  const found: string[] = [];
  const lists = listsOf(language);
  const add = (node: Term): void => {
    const key = termKey(language, node);

    if (!found.includes(key)) {
      found.push(key);
    }
  };
  const visit = (node: Term, bound: ReadonlySet<string>): void => {
    if (node.kind === "variable" && node.binder) {
      return;
    }

    const list = lists.get(node.sort);
    const parts = list === undefined ? [node] : members(list, node);

    if (node.sort === sort) {
      if (list === undefined) {
        if (closed(node, bound)) {
          add(node);
        }
      } else {
        for (let start = 0; start <= parts.length; start += 1) {
          for (let end = start; end <= parts.length; end += 1) {
            const run = parts.slice(start, end);

            if (run.every((part) => closed(part, bound))) {
              add(listOf(language, list, run));
            }
          }
        }
      }
    }

    for (const part of parts) {
      if (part.kind !== "app") {
        continue;
      }

      let inner = bound;

      for (const argument of part.args) {
        if (argument.kind === "variable" && argument.binder) {
          inner = new Set([...inner, argument.name]);
          continue;
        }

        visit(argument, inner);
      }
    }
  };

  visit(term, new Set());

  return found;
}

/** Whether no variable in `term` is one of `bound`. */
function closed(term: Term, bound: ReadonlySet<string>): boolean {
  if (term.kind === "variable") {
    return !bound.has(term.name);
  }

  return term.args.every((argument) => closed(argument, bound));
}

/** The first occurrence of a variable in a term. */
export function occurrence(term: Term, name: string): Term | null {
  if (term.kind === "variable") {
    return term.name === name ? term : null;
  }

  for (const argument of term.args) {
    const found = occurrence(argument, name);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

/** Whether a term mentions a variable anywhere. */
export function mentions(term: Term, name: string): boolean {
  return term.kind === "variable"
    ? term.name === name
    : term.args.some((argument) => mentions(argument, name));
}

/** Patterns to match against rows: side rows, or a premise's rows. */
export interface PatternGroup {
  readonly patterns: readonly Term[];
  readonly rows: readonly Term[];
}

/**
 * Each way a statement of a rule matches: its focus the rows `focus`, in some
 * order, and each group's patterns some of the group's rows, with what that
 * bound.
 */
export function* ruleMatches(
  language: SurfaceLanguage,
  patterns: RulePatterns,
  focus: readonly Term[],
  groups: readonly PatternGroup[],
): Generator<Bindings> {
  if (patterns.focus.length !== focus.length) {
    return;
  }

  const wanted = groups.flatMap((group) =>
    group.patterns.map((pattern) => ({ pattern, rows: group.rows })),
  );
  const extend = function* (
    bindings: Bindings,
    at: number,
  ): Generator<Bindings> {
    const next = wanted[at];

    if (next === undefined) {
      yield bindings;
      return;
    }

    for (const row of next.rows) {
      for (const found of matchAll(
        language,
        next.pattern,
        row,
        patterns.metas,
        bindings,
      )) {
        yield* extend(found, at + 1);
      }
    }
  };
  const focused = function* (
    order: readonly Term[],
    at: number,
    bindings: Bindings,
  ): Generator<Bindings> {
    const pattern = patterns.focus[at];

    if (pattern === undefined) {
      yield* extend(bindings, 0);
      return;
    }

    for (const found of matchAll(
      language,
      pattern,
      order[at] as Term,
      patterns.metas,
      bindings,
    )) {
      yield* focused(order, at + 1, found);
    }
  };

  for (const order of permutations(focus)) {
    yield* focused(order, 0, new Map());
  }
}

/** Every order of some items; one order for one item or none. */
function permutations<T>(items: readonly T[]): readonly (readonly T[])[] {
  if (items.length <= 1) {
    return [items];
  }

  return items.flatMap((item, at) =>
    permutations([...items.slice(0, at), ...items.slice(at + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

/** The bindings of a single-row rule's focus against a row; null if none. */
export function matchFocus(
  language: SurfaceLanguage,
  patterns: RulePatterns,
  row: Term,
): Bindings | null {
  const [focus] = patterns.focus;

  return patterns.focus.length === 1 && focus !== undefined
    ? matchTerm(language, focus, row, patterns.metas)
    : null;
}
