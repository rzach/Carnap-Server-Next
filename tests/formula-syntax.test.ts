import { describe, expect, test } from "bun:test";
import type { SurfaceLanguage } from "@aufbau/syntax";
import type { Formula } from "../src/worker/exercise-kit/formula";
import {
  complementary,
  firstOrderLanguageFor,
  formulaToString,
  isLiteral,
  namesIn,
  parseFormula,
  sameFormula,
  splitArgumentLine,
  substitute,
} from "../src/worker/exercise-kit/formula";

/**
 * The kit's syntactic operations on the formula tree — what a truth tree is
 * checked with — and the shared argument line. Written in forallx (Magnus),
 * whose juxtaposed `Fa` is the notation the tree's own language uses.
 */

const MAGNUS = (() => {
  const found = firstOrderLanguageFor({ dialect: "forallx-magnus" });

  if (found === null) {
    throw new Error("forallx-magnus does not ship");
  }

  return found;
})();

function parse(source: string, lang: SurfaceLanguage = MAGNUS): Formula {
  const result = parseFormula(source, lang);

  if (!result.ok) {
    throw new Error(
      `'${source}' does not parse: ${result.errors[0]?.message}`,
    );
  }

  return result.formula;
}

const shown = (formula: Formula): string => formulaToString(formula, MAGNUS);

/** A quantified formula's body, for writing a name into. */
function body(source: string): { variable: string; body: Formula } {
  const formula = parse(source);

  if (formula.type !== "forall" && formula.type !== "exists") {
    throw new Error(`'${source}' is not quantified`);
  }

  return formula;
}

describe("sameFormula", () => {
  test("compares symbol for symbol", () => {
    expect(sameFormula(parse("Fa & Gb"), parse("(Fa ∧ Gb)"))).toBe(true);
    expect(sameFormula(parse("Fa & Gb"), parse("Gb & Fa"))).toBe(false);
    expect(sameFormula(parse("Rab"), parse("Rba"))).toBe(false);
    expect(sameFormula(parse("¬¬P"), parse("~-P"))).toBe(true);
    expect(sameFormula(parse("a = b"), parse("a = b"))).toBe(true);
  });

  test("counts bound variables by their letter", () => {
    expect(sameFormula(parse("∀xFx"), parse("∀yFy"))).toBe(false);
    expect(sameFormula(parse("∀xFx"), parse("∃xFx"))).toBe(false);
  });

  test("tells the binary connectives apart", () => {
    expect(sameFormula(parse("P ⊃ Q"), parse("P ≡ Q"))).toBe(false);
    expect(sameFormula(parse("P & Q"), parse("P ∨ Q"))).toBe(false);
  });
});

describe("substitute", () => {
  test("writes a name in for the free occurrences", () => {
    const { variable, body: inner } = body("∀x(Fx & Rxa)");
    expect(
      shown(substitute(inner, variable, { name: "b", type: "constant" })),
    ).toBe(shown(parse("Fb & Rba")));
  });

  test("stops at a quantifier that binds the same letter", () => {
    const { variable, body: inner } = body("∀x(Fx & ∀xGx)");
    expect(
      shown(substitute(inner, variable, { name: "a", type: "constant" })),
    ).toBe(shown(parse("Fa & ∀xGx")));
  });

  test("goes under a quantifier over another letter", () => {
    const { variable, body: inner } = body("∀x∃yRxy");
    expect(
      shown(substitute(inner, variable, { name: "c", type: "constant" })),
    ).toBe(shown(parse("∃yRcy")));
  });

  test("leaves a vacuous quantifier's body alone", () => {
    const { variable, body: inner } = body("∀xFa");
    expect(
      sameFormula(
        substitute(inner, variable, { name: "b", type: "constant" }),
        parse("Fa"),
      ),
    ).toBe(true);
  });

  test("reaches identity", () => {
    const { variable, body: inner } = body("∃x x = a");
    expect(
      sameFormula(
        substitute(inner, variable, { name: "b", type: "constant" }),
        parse("b = a"),
      ),
    ).toBe(true);
  });
});

describe("namesIn", () => {
  test("lists names in order of first occurrence", () => {
    expect(namesIn(parse("Rba & (Fa ⊃ ∀xRxc)"))).toEqual(["b", "a", "c"]);
  });

  test("does not list variables", () => {
    expect(namesIn(parse("∀x∃yRxy"))).toEqual([]);
    expect(namesIn(parse("P"))).toEqual([]);
  });

  test("reads identity's terms", () => {
    expect(namesIn(parse("¬a = b"))).toEqual(["a", "b"]);
  });
});

describe("isLiteral", () => {
  test("atoms and negated atoms", () => {
    expect(isLiteral(parse("P"))).toBe(true);
    expect(isLiteral(parse("¬Rab"))).toBe(true);
    expect(isLiteral(parse("a = b"))).toBe(true);
    expect(isLiteral(parse("¬a = b"))).toBe(true);
  });

  test("nothing else", () => {
    expect(isLiteral(parse("¬¬P"))).toBe(false);
    expect(isLiteral(parse("P & Q"))).toBe(false);
    expect(isLiteral(parse("∀xFx"))).toBe(false);
    expect(isLiteral(parse("¬∃xFx"))).toBe(false);
  });
});

describe("complementary", () => {
  test("a formula and its negation, in either order", () => {
    expect(complementary(parse("P & Q"), parse("¬(P & Q)"))).toBe(true);
    expect(complementary(parse("¬Fa"), parse("Fa"))).toBe(true);
  });

  test("not a double negation, or a different formula", () => {
    expect(complementary(parse("P"), parse("¬¬P"))).toBe(false);
    expect(complementary(parse("Fa"), parse("¬Fb"))).toBe(false);
    expect(complementary(parse("P"), parse("P"))).toBe(false);
  });
});

describe("splitArgumentLine", () => {
  test("splits premises from conclusions, respecting brackets", () => {
    expect(splitArgumentLine("R(a,b), P :|-: Q")).toEqual({
      conclusions: ["Q"],
      premises: ["R(a,b)", "P"],
    });
  });

  test("drops a leading bullet and empty pieces", () => {
    expect(splitArgumentLine("- :|-: P ∨ ¬P")).toEqual({
      conclusions: ["P ∨ ¬P"],
      premises: [],
    });
  });

  test("refuses a second turnstile", () => {
    expect(splitArgumentLine("P :|-: Q :|-: R")).toBeNull();
  });
});
