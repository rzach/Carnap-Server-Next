import { describe, expect, test } from "bun:test";
import { compileCarnapMarkdown } from "../src/worker/application/content/compiler";
import type { ExerciseManifestItem } from "../src/worker/domain/content";
import type { JsonValue } from "../src/worker/domain/json";
import type { Formula } from "../src/worker/exercise-kit/formula";
import {
  forcingSets,
  parseFormula,
} from "../src/worker/exercise-kit/formula";
import { withSystemText } from "../src/worker/exercise-kit/systems/join";
import { WORLD_EXERCISE } from "../src/worker/exercises/world";
import type {
  Block,
  BlocksState,
} from "../src/worker/exercises/world/kinds/blocks";
import { BLOCKS_KIND } from "../src/worker/exercises/world/kinds/blocks";
import type {
  GameChoice,
  PlayedGame,
} from "../src/worker/exercises/world/logic/game";
import { playGame } from "../src/worker/exercises/world/logic/game";
import {
  bindVocabulary,
  worldStructure,
} from "../src/worker/exercises/world/logic/structure";
import {
  WORLD_ANSWER_KIND,
  WORLD_SCHEMA_VERSION,
} from "../src/worker/exercises/world/types";
import { passthroughTranslator } from "../src/worker/i18n/translator";
import {
  BLOCKS_SPEC_SOURCE,
  blocksLanguage,
} from "./helpers/blocks-language";

function block(
  id: string,
  shape: Block["shape"],
  size: Block["size"],
  col: number,
  row: number,
  names: string[] = [],
): Block {
  return { col, id, names, row, shape, size };
}

/** A small cube named a, a large tet, and a medium dodec named b. */
const WORLD: BlocksState = {
  kind: "blocks@1",
  objects: [
    block("o1", "cube", "small", 2, 2, ["a"]),
    block("o2", "tet", "large", 5, 5),
    block("o3", "dodec", "medium", 7, 1, ["b"]),
  ],
};

function formula(text: string): Formula {
  const parsed = parseFormula(text, blocksLanguage());

  if (!parsed.ok) {
    throw new Error(`does not parse: ${text}`);
  }

  return parsed.formula;
}

function play(
  text: string,
  claim: boolean,
  choices: readonly GameChoice[],
  state: BlocksState = WORLD,
): PlayedGame {
  const structure = worldStructure(
    BLOCKS_KIND,
    state,
    bindVocabulary(BLOCKS_KIND, blocksLanguage()),
  );

  return playGame(formula(text), structure, { choices, claim });
}

function outcome(game: PlayedGame): string {
  const { state } = game;
  return state.type === "over" ? (state.won ? "won" : "lost") : state.type;
}

/** The index of the first move after which the claim cannot be defended. */
function lostAt(game: PlayedGame): number {
  return game.steps.findIndex((step) => !step.right);
}

describe("forcing sets", () => {
  test("give the textbook moves for the four connectives", () => {
    expect(forcingSets("and", true)).toEqual([[true, true]]);
    expect(forcingSets("and", false)).toEqual([
      [false, null],
      [null, false],
    ]);
    expect(forcingSets("or", true)).toEqual([
      [true, null],
      [null, true],
    ]);
    expect(forcingSets("if", true)).toEqual([
      [false, null],
      [null, true],
    ]);
    expect(forcingSets("if", false)).toEqual([[true, false]]);
  });

  test("give a biconditional both parts, as rows", () => {
    expect(forcingSets("iff", true)).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(forcingSets("iff", false)).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  test("say when a connective's value is settled whatever its parts", () => {
    expect(forcingSets("binary-verum", true)).toBeNull();
    expect(forcingSets("binary-verum", false)).toEqual([]);
    expect(forcingSets("left-projection", true)).toEqual([[true, null]]);
  });
});

describe("playing the game", () => {
  test("a good witness wins an existential", () => {
    const game = play("∃x(Cube(x) ∧ Small(x))", true, ["o1"]);

    expect(outcome(game)).toBe("won");
    expect(game.steps.map((step) => step.type)).toEqual([
      "claim",
      "object",
      "part",
    ]);
    expect(lostAt(game)).toBe(-1);
  });

  test("a bad witness loses, and is the move that lost", () => {
    const game = play("∃x(Cube(x) ∧ Small(x))", true, ["o2"]);

    expect(outcome(game)).toBe("lost");
    expect(lostAt(game)).toBe(1);
    // The computer challenges the conjunct that fails.
    const last = game.steps.at(-1);
    expect(last?.type === "part" && last.to.path).toEqual([0, 0]);
  });

  test("a wrong first claim cannot be defended", () => {
    const game = play("∃x(Cube(x) ∧ Small(x))", false, [[false, null]]);

    expect(outcome(game)).toBe("lost");
    expect(lostAt(game)).toBe(0);
    // The computer found the witness.
    const chosen = game.steps[1];
    expect(chosen?.type === "object" && chosen.object).toBe("o1");
  });

  test("the computer tries every object against a universal", () => {
    const game = play("∀x(Cube(x) → Small(x))", true, [[null, true]]);

    expect(outcome(game)).toBe("won");
    const chosen = game.steps[1];
    expect(chosen?.type === "object" && chosen.by).toBe("computer");
  });

  test("a negation carries the opposite claim into its part", () => {
    const game = play("¬Tet(a)", true, []);

    expect(outcome(game)).toBe("won");
    expect(game.steps[1]?.type).toBe("follow");
    expect(game.steps[1]?.type === "follow" && game.steps[1].to.claim).toBe(
      false,
    );
  });

  test("a biconditional takes a row, then the computer's pick from it", () => {
    const right = play("Cube(a) ↔ Tet(b)", false, [[true, false]]);
    const wrong = play("Cube(a) ↔ Tet(b)", false, [[false, true]]);

    expect(outcome(right)).toBe("won");
    expect(right.steps.map((step) => step.type)).toEqual([
      "claim",
      "parts",
      "part",
    ]);
    expect(outcome(wrong)).toBe("lost");
    expect(lostAt(wrong)).toBe(1);
  });

  test("stops where the student has a choice to make", () => {
    const game = play("∃x Cube(x)", true, []);

    expect(game.state.type).toBe("choose-object");
    expect(play("Cube(a) ∨ Tet(a)", true, []).state).toMatchObject({
      options: [
        [true, null],
        [null, true],
      ],
      type: "choose-parts",
    });
  });

  test("refuses a choice that does not fit, or one past the end", () => {
    expect(outcome(play("∃x Cube(x)", true, ["o9"]))).toBe("invalid");
    expect(outcome(play("∃x Cube(x)", true, [[true, null]]))).toBe("invalid");
    expect(outcome(play("∃x Cube(x)", true, ["o1", "o1"]))).toBe("invalid");
    expect(outcome(play("Cube(a) ∨ Tet(a)", true, [[true, true]]))).toBe(
      "invalid",
    );
  });

  test("an empty world has no witness and no counterexample", () => {
    const empty = BLOCKS_KIND.empty();

    expect(play("∃x Cube(x)", true, [], empty).state).toMatchObject({
      end: { by: "student", reason: "no-object" },
      won: false,
    });
    expect(play("∀x Cube(x)", true, [], empty).state).toMatchObject({
      end: { by: "computer", reason: "no-object" },
      won: true,
    });
  });
});

const LANGUAGE_BLOCK = `:::aufbau-mm0{name="blocks-lpl"}\n${BLOCKS_SPEC_SOURCE}:::\n\n`;

function directive(attrs: string, body: string): string {
  return `${LANGUAGE_BLOCK}::::world{system="blocks-lpl" ${attrs}}\n${body}\n::::`;
}

const GAME_BODY = [
  "- ∃x(Cube(x) ∧ Small(x))",
  "- ∀x Cube(x)",
  "| block : small cube at 2,2 named a",
  "| block : large tet at 5,5",
].join("\n");

async function compiled(source: string) {
  return compileCarnapMarkdown(source);
}

async function declaration(source: string): Promise<ExerciseManifestItem> {
  const result = await compiled(source);

  if (!result.ok) {
    throw new Error(
      `compile failed: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  }

  const item = result.artifact.manifest[0] as ExerciseManifestItem;

  return {
    ...item,
    publicData: withSystemText(item.publicData, result.artifact.systems),
  };
}

async function grade(item: ExerciseManifestItem, data: JsonValue) {
  const normalized = WORLD_EXERCISE.normalizeAnswer(
    { data, kind: WORLD_ANSWER_KIND, schemaVersion: WORLD_SCHEMA_VERSION },
    item,
  );

  if (!normalized.ok) {
    throw new Error(`answer refused: ${normalized.reason}`);
  }

  const evaluation = await WORLD_EXERCISE.evaluate(normalized.answer, item, {
    now: new Date("2026-01-01T00:00:00Z"),
  } as never);
  const review = WORLD_EXERCISE.reviewAnswer(normalized.answer, item, {
    audience: "student",
    i18n: passthroughTranslator,
  } as never);

  return { score: evaluation.awardedScore, summary: review.summary };
}

describe("the game variant", () => {
  test("compiles like evaluate, and says full feedback when nothing is said", async () => {
    const item = await declaration(directive('#g variant="game"', GAME_BODY));

    expect(item.feedback).toBe("full");
    expect(
      (item.publicData as { sentences: unknown[] }).sentences,
    ).toHaveLength(2);
    expect(
      (
        await declaration(
          directive('#g variant="game" feedback="terse"', GAME_BODY),
        )
      ).feedback,
    ).toBe("terse");
  });

  test("refuses feedback=none, which the game cannot keep", async () => {
    const result = await compiled(
      directive('#g variant="game" feedback="none"', GAME_BODY),
    );

    expect(result.diagnostics.map((d) => d.code)).toContain(
      "world_game_feedback_none",
    );
  });

  test("refuses a target prefix, pins, and laws", async () => {
    const result = await compiled(
      directive(
        '#g variant="game"',
        [
          "- true: Cube(a)",
          "| pinned block : small cube at 2,2 named a",
          "| law : Cube(a)",
        ].join("\n"),
      ),
    );

    expect(result.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "world_evaluate_target",
        "world_pinned_variant",
        "world_laws_variant",
      ]),
    );
  });

  test("scores the games won, replayed on the server", async () => {
    const item = await declaration(
      directive('#g variant="game" points="2"', GAME_BODY),
    );
    const won = { choices: ["o1"], claim: true };
    // ∀x Cube(x) is false; claiming so, the student picks the tet.
    const counter = { choices: ["o2"], claim: false };

    expect(await grade(item, { games: [won, counter] })).toEqual({
      score: 2,
      summary: "You won every game.",
    });
    expect(
      (await grade(item, { games: [{ choices: ["o2"], claim: true }, null] }))
        .score,
    ).toBe(0);
    expect((await grade(item, { games: [won] })).score).toBe(1);
    expect(
      (await grade(item, { games: [won, { choices: [], claim: false }] }))
        .summary,
    ).toBe("Won: 1 of 2. Take another look at: ∀xCube(x).");
  });

  test("refuses a game of the wrong shape, but not a bad move", async () => {
    const item = await declaration(directive('#g variant="game"', GAME_BODY));

    expect(
      WORLD_EXERCISE.normalizeAnswer(
        {
          data: { games: [{ choices: [7], claim: true }] },
          kind: WORLD_ANSWER_KIND,
          schemaVersion: WORLD_SCHEMA_VERSION,
        },
        item,
      ).ok,
    ).toBe(false);
    expect(
      (await grade(item, { games: [{ choices: ["nope"], claim: true }] }))
        .score,
    ).toBe(0);
  });
});
