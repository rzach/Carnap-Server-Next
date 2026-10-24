import { describe, expect, test } from "bun:test";
import { compileCarnapMarkdown } from "../src/worker/application/content/compiler";
import type { ExerciseManifestItem } from "../src/worker/domain/content";
import type { JsonValue } from "../src/worker/domain/json";
import { withSystemText } from "../src/worker/exercise-kit/systems/join";
import { SYNTAX_TREE_EXERCISE } from "../src/worker/exercises/syntax-tree";
import {
  SYNTAX_TREE_ANSWER_KIND,
  SYNTAX_TREE_SCHEMA_VERSION,
} from "../src/worker/exercises/syntax-tree/types";
import { passthroughTranslator } from "../src/worker/i18n/translator";

/**
 * The syntax-tree type's worker half: the directive, the grade and the
 * review. The tree itself is `tests/syntax-tree-logic.test.ts`.
 */

function directive(attrs: string, body: string): string {
  return `::::syntax-tree{${attrs}}\n${body}\n::::`;
}

async function compileCodes(source: string): Promise<string[]> {
  return (await compileCarnapMarkdown(source)).diagnostics.map((d) => d.code);
}

/** The declaration as a reader sees it: its system's text joined back in. */
async function declaration(source: string): Promise<ExerciseManifestItem> {
  const compiled = await compileCarnapMarkdown(source);

  if (!compiled.ok) {
    throw new Error(
      `does not compile: ${compiled.diagnostics.map((d) => d.code).join(", ")}`,
    );
  }

  const item = compiled.artifact.manifest[0];

  if (item === undefined) {
    throw new Error("no exercise");
  }

  return {
    ...item,
    publicData: withSystemText(
      item.publicData,
      compiled.artifact.systems,
    ) as JsonValue,
  };
}

async function grade(
  item: ExerciseManifestItem,
  data: JsonValue,
  reveal = true,
): Promise<{ html: string; score: number; status: string; summary: string }> {
  const normalized = SYNTAX_TREE_EXERCISE.normalizeAnswer(
    {
      data,
      kind: SYNTAX_TREE_ANSWER_KIND,
      schemaVersion: SYNTAX_TREE_SCHEMA_VERSION,
    },
    item,
  );

  if (!normalized.ok) {
    throw new Error(`answer refused: ${normalized.reason}`);
  }

  const evaluation = await SYNTAX_TREE_EXERCISE.evaluate(
    normalized.answer,
    item,
    { now: new Date("2026-01-01T00:00:00Z") } as never,
  );
  const review = SYNTAX_TREE_EXERCISE.reviewAnswer(normalized.answer, item, {
    audience: "student",
    i18n: passthroughTranslator,
    revealCorrectness: reveal,
  } as never);

  return {
    html: review.elementHtml ?? "",
    score: evaluation.awardedScore,
    status: evaluation.status,
    summary: review.summary,
  };
}

const PROP = directive(
  '#st points="4"',
  "Split the sentence.\n\n- P /\\ (R -> ~Q)",
);
const PARTIAL = directive(
  '#sp points="4" scoring="partial"',
  "- P /\\ (R -> ~Q)",
);

/** The three right picks for `P ∧ (R → ¬Q)`, root first. */
const RIGHT = [
  { clicked: [], node: [] },
  { clicked: [1], node: [1] },
  { clicked: [1, 1], node: [1, 1] },
];

/** `∀x(F(x) ∧ ∃x G(x))` through its terms: five splits and two links. */
const TERMS = directive(
  '#st points="7" system="forallx-calgary" depth="terms" scoring="partial"',
  "- Ax(F(x) & Ex G(x))",
);
const TERM_SPLITS = [[], [1], [1, 0], [1, 1], [1, 1, 1]].map((path) => ({
  clicked: path,
  node: path,
}));
const TERM_LINKS = [
  { linked: [], node: [1, 0, 0, 0, 0] },
  { linked: [1, 1], node: [1, 1, 1, 0, 0, 0] },
];

describe("the directive", () => {
  test("stores the sentence as engine text, with its prompt and scoring", async () => {
    const item = await declaration(PROP);

    expect(item.kind).toBe("syntax-tree@1");
    expect(item.publicData).toMatchObject({
      scoring: "whole",
      sentence: "(P /\\ (R -> (~ Q)))",
      system: "carnap-prop",
    });
    expect((item.publicData as { promptHtml: string }).promptHtml).toContain(
      "Split the sentence.",
    );
    expect((await declaration(PARTIAL)).publicData).toMatchObject({
      scoring: "partial",
    });
  });

  test("what an author can get wrong", async () => {
    expect(
      await compileCodes(directive("#s1", "No sentence here.")),
    ).toContain("missing_syntax_tree_sentence");
    expect(await compileCodes(directive("#s1", "- P /\\ Q\n- Q"))).toContain(
      "invalid_syntax_tree_body",
    );
    expect(await compileCodes(directive("#s1", "- P /\\"))).toContain(
      "invalid_formula",
    );
    expect(await compileCodes(directive("#s1", "- P"))).toContain(
      "atomic_syntax_tree_sentence",
    );
    expect(
      await compileCodes(directive('#s1 scoring="most"', "- P /\\ Q")),
    ).toContain("invalid_syntax_tree_scoring");
    expect(
      await compileCodes(directive('#s1 depth="atoms"', "- P /\\ Q")),
    ).toContain("invalid_syntax_tree_depth");
    expect(
      await compileCodes(directive('#s1 order="any"', "- P /\\ Q")),
    ).toContain("unknown_attribute");
  });

  test("a language that marks no sort as its sentences is refused", async () => {
    const bare = `:::aufbau-mm0{name="bare"}
sort s;
term a: s;
term n (x: s): s;
prefix n: $~$ prec 50;
:::

${directive('#s1 system="bare"', "- ~ a")}`;

    expect(await compileCodes(bare)).toEqual([
      "missing_syntax_tree_sentence_sort",
    ]);
    // Through its terms it needs none: every node is drawn, whatever its sort.
    expect(
      await compileCodes(
        bare.replace('system="bare"', 'system="bare" depth="terms"'),
      ),
    ).toEqual([]);
  });

  test("stores the depth, which is connectives unless asked", async () => {
    expect((await declaration(PROP)).publicData).toMatchObject({
      depth: "connectives",
    });
    expect((await declaration(TERMS)).publicData).toMatchObject({
      depth: "terms",
    });
  });

  test("any language: a quantified sentence in forallx", async () => {
    const item = await declaration(
      directive('#sq system="forallx-calgary"', "- Ax(F(x) -> G(x))"),
    );

    expect(item.publicData).toMatchObject({ system: "forallx-calgary" });
  });
});

describe("grading", () => {
  test("whole: the full tree scores in full", async () => {
    const result = await grade(await declaration(PROP), { picks: RIGHT });

    expect(result).toMatchObject({ score: 4, status: "correct" });
    expect(result.summary).toBe("Every connective picked correctly.");
  });

  test("whole: an unfinished tree scores nothing, and says it is unfinished", async () => {
    const result = await grade(await declaration(PROP), {
      picks: RIGHT.slice(0, 2),
    });

    expect(result).toMatchObject({ score: 0, status: "incorrect" });
    expect(result.summary).toBe("The tree is not finished.");
  });

  test("whole: a wrong pick anywhere scores nothing", async () => {
    const result = await grade(await declaration(PROP), {
      picks: [{ clicked: [1], node: [] }, ...RIGHT.slice(1)],
    });

    expect(result).toMatchObject({ score: 0, status: "incorrect" });
  });

  test("partial: the share of sentences picked right", async () => {
    const result = await grade(await declaration(PARTIAL), {
      picks: [{ clicked: [1], node: [] }, ...RIGHT.slice(1)],
    });

    expect(result.score).toBeCloseTo((4 * 2) / 3);
    expect(result.status).toBe("incorrect");
    expect(result.summary).toBe("Main connectives found: 2 of 3");
  });

  test("a pick at no node, or a second at one, is not counted", async () => {
    const item = await declaration(PARTIAL);
    const padded = await grade(item, {
      picks: [
        { clicked: [9], node: [9] },
        { clicked: [0], node: [0] },
        { clicked: [1], node: [] },
        { clicked: [], node: [] },
        ...RIGHT.slice(1),
      ],
    });

    // The first pick at the root (wrong) is the one that counts.
    expect(padded.score).toBeCloseTo((4 * 2) / 3);
  });

  test("terms: splits and links are scored alike", async () => {
    const item = await declaration(TERMS);
    const all = await grade(item, { picks: [...TERM_SPLITS, ...TERM_LINKS] });
    const oneFree = await grade(item, {
      picks: [
        ...TERM_SPLITS,
        { linked: null, node: [1, 0, 0, 0, 0] },
        ...TERM_LINKS.slice(1),
      ],
    });

    expect(all).toMatchObject({ score: 7, status: "correct" });
    expect(all.summary).toBe("Every split and link is correct.");
    expect(oneFree.score).toBeCloseTo(6);
    expect(oneFree.summary).toBe("Splits and links right: 6 of 7");
  });

  test("a link at a node with no variable, or a split at a variable, is not counted", async () => {
    const item = await declaration(TERMS);
    const result = await grade(item, {
      picks: [
        { linked: null, node: [] },
        { clicked: [1, 0, 0, 0, 0], node: [1, 0, 0, 0, 0] },
        ...TERM_SPLITS,
        ...TERM_LINKS,
      ],
    });

    expect(result.status).toBe("correct");
  });

  test("only JSON that is not a list of picks is refused", async () => {
    const item = await declaration(PROP);

    for (const data of [
      {},
      { picks: "all" },
      { picks: [{ node: [] }] },
      { picks: [{ clicked: [-1], node: [] }] },
      { picks: [{ clicked: [], linked: null, node: [] }] },
      { picks: [{ linked: "x", node: [] }] },
    ]) {
      expect(
        SYNTAX_TREE_EXERCISE.normalizeAnswer(
          {
            data: data as JsonValue,
            kind: SYNTAX_TREE_ANSWER_KIND,
            schemaVersion: SYNTAX_TREE_SCHEMA_VERSION,
          },
          item,
        ).ok,
        JSON.stringify(data),
      ).toBe(false);
    }
  });
});

describe("review and rendering", () => {
  test("the review draws the tree as far as it was split", async () => {
    const { html } = await grade(await declaration(PROP), {
      picks: RIGHT.slice(0, 1),
    });

    expect(html).toContain('data-path="" data-state="split"');
    expect(html).toContain('data-path="1" data-state="open"');
    expect(html).not.toContain('data-path="1.1"');
  });

  test("partial: a wrong pick still splits the sentence in review", async () => {
    const { html } = await grade(await declaration(PARTIAL), {
      picks: [{ clicked: [1], node: [] }],
    });

    expect(html).toContain('data-path="" data-state="split"');
  });

  test("terms: a linked variable carries its quantifier, for the line and in words", async () => {
    const { html } = await grade(await declaration(TERMS), {
      picks: [...TERM_SPLITS, ...TERM_LINKS],
    });

    expect(html).toContain('data-bound-by="1.1" data-path="1.1.1.0.0.0"');
    expect(html).toContain(
      '<span class="st-link-note visually-hidden">bound by ∃x</span>',
    );
    // The lines are measured, so the review loads the element to draw them.
    expect(html).toContain('"mode":"review"');
    expect(html).toContain("/assets/components/carnap-syntax-tree-v1.js");
  });

  test("a sealed review keeps the tree and drops the verdict", async () => {
    const { html, summary } = await grade(
      await declaration(PROP),
      { picks: RIGHT },
      false,
    );

    // The element's strings ride along for drawing the lines; the verdict
    // paragraph is what a sealed review leaves out.
    expect(summary).toBe("Syntax tree");
    expect(html).not.toContain('class="syntax-tree-review-verdict"');
    expect(html).toContain('data-state="split"');
  });

  test("the element draws the sentence inert, its connectives named by role", async () => {
    const item = await declaration(PROP);
    const html = SYNTAX_TREE_EXERCISE.render(
      {
        exerciseId: item.id,
        exerciseKind: item.kind,
        kind: "exercise",
        publicData: item.publicData,
        render: item.render,
      } as never,
      { heading: { level: 2, number: 1 }, i18n: passthroughTranslator },
    );

    expect(html).toContain("<carnap-syntax-tree");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="/\\, conjunction"');
    expect(html).toContain('aria-label="~, negation"');
    expect(html.match(/<button class="st-op"[^>]* disabled>/g)).toHaveLength(
      3,
    );
  });
});
