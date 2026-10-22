import { describe, expect, test } from "bun:test";
import type { SurfaceLanguage, Term } from "@aufbau/syntax";
import { printTerm, sameTerm, substitute } from "@aufbau/syntax";
import { closureOn } from "../src/worker/exercises/truth-tree/aufbau/branch";
import {
  matchedRows,
  readTreeDevelopment,
} from "../src/worker/exercises/truth-tree/aufbau/criteria";
import type { RulePatterns } from "../src/worker/exercises/truth-tree/aufbau/patterns";
import {
  canonical,
  computedTerm,
  matchAll,
} from "../src/worker/exercises/truth-tree/aufbau/patterns";
import { readEngine } from "../src/worker/exercises/truth-tree/aufbau/rows";
import {
  isTreeTheory,
  readTreeTheory,
} from "../src/worker/exercises/truth-tree/aufbau/theory";
import {
  LANGUAGE_SPEC_SOURCES,
  languageFromSource,
} from "../src/worker/logic/specs";

/**
 * The completeness half of deciding a branch by matching (#478): a rigid
 * pattern matches every row the engine takes for one of its instances.
 *
 * Each row each built-in tree theory's branches are matched by (a closure
 * row, a row a rule develops or asks beside it, by the rule's view where it
 * has one) is filled in with random terms of its metavariables'
 * sorts, built from the theory's own terms by name, defs and rewritten
 * terms (`{x / te} ph`) among them, so the row as written is rarely the
 * instance's canonical form. The matcher must find bindings on the row,
 * and the instance they make must be the row by `sameTerm`, the engine's
 * identity: the confirmation a closure is written with. A miss is a branch
 * Carnap would call open that the engine could close.
 */

const TRIALS = 60;

/** The built-in tree theories whose rows have something to compute. */
const COMPUTING = new Set([
  "forallx-ubc",
  "open-logic-tableaux",
  "open-logic-intuitionistic",
]);
const DEPTH = 3;

/** A small seeded generator, so a failure names a row that reproduces. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random engine text at a sort: one of the sort's variables, or one of the
 * terms that build it, by name, with arguments as random as itself. A bound
 * argument (`{x: var}`) is a variable of its sort. Null where the sort has
 * no variable and the depth has run out of terms without arguments.
 */
function randomText(
  language: SurfaceLanguage,
  sort: string,
  depth: number,
  random: () => number,
): string | null {
  const pick = <T>(items: readonly T[]): T | undefined =>
    items[Math.floor(random() * items.length)];
  const variables = language.spec.sorts.get(sort)?.vars ?? [];
  const builders = [...language.spec.terms.values()].filter(
    (info) =>
      info.returnSort === sort &&
      info.binders.every((binder) => "sort" in binder.type),
  );
  const leaves = builders.filter((info) => info.binders.length === 0);
  const variable = pick(variables);

  if (depth <= 0 || builders.length === 0 || random() < 0.25) {
    if (variable !== undefined && (leaves.length === 0 || random() < 0.5)) {
      return variable;
    }

    const leaf = pick(leaves);

    if (leaf !== undefined) {
      return leaf.name;
    }

    if (depth <= -2) {
      return variable ?? null;
    }
  }

  const info = pick(builders);

  if (info === undefined) {
    return variable ?? null;
  }

  const args: string[] = [];

  for (const binder of info.binders) {
    const argumentSort =
      "sort" in binder.type ? binder.type.sort : (undefined as never);
    const argument = binder.binds
      ? pick(language.spec.sorts.get(argumentSort)?.vars ?? [])
      : randomText(language, argumentSort, depth - 1, random);

    if (argument === undefined || argument === null) {
      return variable ?? null;
    }

    // A binding variable reads only bare (`sb_f x a ph`, not `sb_f (x) …`).
    args.push(argument.includes(" ") ? `(${argument})` : argument);
  }

  return args.length === 0 ? info.name : `${info.name} ${args.join(" ")}`;
}

/** Random bindings for a statement's metavariables, read back as terms. */
function randomBindings(
  language: SurfaceLanguage,
  patterns: RulePatterns,
  random: () => number,
): Map<string, Term> | null {
  const bindings = new Map<string, Term>();

  for (const binder of patterns.binders) {
    if (!("sort" in binder.type) || binder.name === patterns.branch) {
      continue;
    }

    const sort = binder.type.sort;
    const pool = language.spec.sorts.get(sort)?.vars ?? [];
    const text = binder.binds
      ? pool[Math.floor(random() * pool.length)]
      : randomText(language, sort, DEPTH, random);
    const term =
      text === undefined || text === null
        ? null
        : readEngine(language, text, sort);

    if (term === null) {
      return null;
    }

    bindings.set(binder.name, term);
  }

  return bindings;
}

/**
 * The rows a statement focuses on, filled in by `bindings` and printed as a
 * student's would be, each metavariable spelled as written or in canonical
 * form at random, row by row: one term the engine takes for itself,
 * written two ways (`a ≠ b` and `¬ a = b`, `{x / a} F x` and `F a`).
 */
function rowsFor(
  language: SurfaceLanguage,
  patterns: RulePatterns,
  focus: readonly Term[],
  bindings: ReadonlyMap<string, Term>,
  random: () => number,
): Term[] | null {
  const rows: Term[] = [];

  for (const pattern of focus) {
    const spelled = new Map(
      [...bindings].map(([meta, value]) => [
        meta,
        random() < 0.5 ? value : canonical(language, value),
      ]),
    );
    const row = readEngine(
      language,
      printTerm(language, substitute(pattern, spelled), "engine"),
      pattern.sort,
    );

    if (row === null) {
      return null;
    }

    rows.push(row);
  }

  return patterns.focus.length === rows.length ? rows : null;
}

const TREE_SYSTEMS = Object.keys(LANGUAGE_SPEC_SOURCES).filter((id) => {
  const language = languageFromSource(LANGUAGE_SPEC_SOURCES[id] ?? "");
  return language !== null && isTreeTheory(readTreeTheory(language));
});

describe("a rigid pattern matches every row the engine takes for an instance", () => {
  test("there are tree theories to check", () => {
    expect(TREE_SYSTEMS).toContain("forallx-ubc");
    expect(TREE_SYSTEMS).toContain("open-logic-intuitionistic");
  });

  test.each(TREE_SYSTEMS)("%s", (id) => {
    const language = languageFromSource(
      LANGUAGE_SPEC_SOURCES[id] ?? "",
    ) as SurfaceLanguage;
    const theory = readTreeTheory(language);

    if (!isTreeTheory(theory)) {
      throw new Error(`${id} is not a tree theory`);
    }

    const development = readTreeDevelopment(language, theory);
    const random = seeded(478);
    const missed: string[] = [];
    let tried = 0;
    // Trials whose rows are not already in canonical form: the ones that
    // show matching sees what the engine computes.
    let computed = 0;
    const show = (rows: readonly Term[]): string =>
      rows.map((row) => printTerm(language, row, "engine")).join(" ; ");
    const isCanonical = (rows: readonly Term[]): boolean =>
      rows.every(
        (row) =>
          printTerm(language, row, "engine") ===
          printTerm(language, canonical(language, row), "engine"),
      );

    // Closing: the closure statements' rows together, through `closureOn`,
    // which a branch marked open is refused by and a × is written with.
    for (const patterns of development.closure) {
      expect(
        patterns.focus.map((pattern) => computedTerm(language, pattern)),
      ).toEqual(patterns.focus.map(() => null));

      for (let trial = 0; trial < TRIALS; trial += 1) {
        const bindings = randomBindings(language, patterns, random);
        const rows =
          bindings === null
            ? null
            : rowsFor(language, patterns, patterns.focus, bindings, random);

        if (rows === null) {
          continue;
        }

        tried += 1;
        computed += isCanonical(rows) ? 0 : 1;

        if (closureOn(language, development, rows) === null) {
          missed.push(`${patterns.name}: ${show(rows)}`);
        }
      }
    }

    // Owing a step: each row a rule develops or asks beside them, which say
    // which rows owe the rule.
    for (const [patterns, pattern] of matchedRows([], development.rules)) {
      expect(computedTerm(language, pattern)).toBeNull();

      for (let trial = 0; trial < TRIALS; trial += 1) {
        const bindings = randomBindings(language, patterns, random);
        const [row] =
          (bindings === null
            ? null
            : rowsFor(
                language,
                { ...patterns, focus: [pattern] },
                [pattern],
                bindings,
                random,
              )) ?? [];

        if (row === undefined) {
          continue;
        }

        tried += 1;
        computed += isCanonical([row]) ? 0 : 1;

        const found = [
          ...matchAll(language, pattern, row, patterns.metas),
        ].some((each) => sameTerm(language, substitute(pattern, each), row));

        if (!found) {
          missed.push(`${patterns.name}: ${show([row])}`);
        }
      }
    }

    // Where rows compute (UBC's `≠` and substitution, OLP's substitution,
    // the intuitionistic prefixes as lists), some trial must have been
    // written other than canonically, or the test shows nothing.
    if (COMPUTING.has(id)) {
      expect(computed).toBeGreaterThan(0);
    }

    expect(tried).toBeGreaterThan(0);
    expect(missed).toEqual([]);
  });
});
