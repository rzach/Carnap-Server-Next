import { describe, expect, test } from "bun:test";
import {
  type Highlight,
  highlightAnnouncement,
} from "../../src/client/components/world-highlight";

/**
 * The live region's sentence for a highlight: a long list of satisfiers is
 * cut to its first few and the total, since unnamed blocks read aloud are
 * long ("the block at column 6, row 7").
 */

const words = (id: string, values: Readonly<Record<string, string>> = {}) =>
  id.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

function highlight(mode: Highlight["mode"], count: number): Highlight {
  return {
    described: Array.from({ length: count }, (_, i) => `o${i + 1}`),
    mode,
    pairs: [],
    rings: new Map(),
    text: "Cube(x)",
  };
}

describe("highlight announcements", () => {
  test("a short list is read in full", () => {
    expect(highlightAnnouncement(highlight("objects", 5), words)).toBe(
      "Cube(x): satisfied by o1; o2; o3; o4; o5.",
    );
  });

  test("a long list gives its first five and the total", () => {
    expect(highlightAnnouncement(highlight("pairs", 7), words)).toBe(
      "Cube(x): satisfied by o1; o2; o3; o4; o5, and others: 7 in all.",
    );
    expect(highlightAnnouncement(highlight("witnesses", 6), words)).toBe(
      "Cube(x): witnesses o1; o2; o3; o4; o5, and others: 6 in all.",
    );
    expect(
      highlightAnnouncement(highlight("counterexamples", 9), words),
    ).toBe(
      "Cube(x): counterexamples o1; o2; o3; o4; o5, and others: 9 in all.",
    );
  });
});
