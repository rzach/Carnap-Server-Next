/**
 * Display layout for a written-out formula: the ordered run of fillable cells
 * (one per atom occurrence and one per connective) and the text between them,
 * as a truth table draws it left to right. DOM-free — the worker SSRs the grid
 * from it and the client element reads cell coordinates back against the same
 * order, so both sides must derive the layout from this one function.
 *
 * The layout is the formula as the language prints it, not a second printer:
 * `printPieces` gives the display text as pieces, each naming the node it came
 * from, and every piece lands under the formula that node was read as. The
 * spellings, the brackets and their order are the spec's, so a table set in
 * forallx draws `∧` where `carnap-prop` draws `/\`, and the outermost pair is
 * there exactly when the language's display keeps it (`@syntax display
 * drop-outer-parens`). Before 2026-10-21 this file re-derived the brackets and
 * spellings itself, and could disagree with every other place a formula is
 * shown.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import { printPieces } from "@aufbau/syntax";
import type { Formula, ParseResult } from "./formula";

export type CellRole = "atom" | "connective";

/** A fillable position under the written-out formula. */
export interface CellSegment {
  readonly kind: "cell";
  readonly role: CellRole;
  /** The display text: the atom as printed, or the connective's token. */
  readonly text: string;
  /** The sub-formula this cell evaluates (an atom node or a connective node). */
  readonly formula: Formula;
  /** True only for the cell under the formula's main connective. */
  readonly isMain: boolean;
}

/**
 * Text no cell stands under: a bracket, or a connective's second token where
 * its notation has more than one.
 */
export interface MarkSegment {
  readonly kind: "mark";
  readonly text: string;
}

export type FormulaSegment = MarkSegment | CellSegment;

type Read = Extract<ParseResult, { readonly ok: true }>;

/**
 * The formula a piece at `path` belongs to: its node's, or the nearest
 * enclosing node's that was read as one. An atom's own structure — `F(a)`'s
 * head, brackets and argument — is nobody's but the atom's.
 */
function owner(
  nodes: Read["nodes"],
  path: readonly number[],
): Formula | undefined {
  for (let depth = path.length; depth >= 0; depth -= 1) {
    const found = nodes.get(path.slice(0, depth).join("."));

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

/** The full cell-and-bracket run for a written-out formula. */
export function formulaLayout(
  read: Read,
  lang: SurfaceLanguage,
): FormulaSegment[] {
  const out: FormulaSegment[] = [];
  const cellOf = new Set<Formula>();

  for (const piece of printPieces(lang, read.term)) {
    const formula = owner(read.nodes, piece.path);

    if (formula === undefined) {
      continue;
    }

    // An atom is one cell, whatever it prints as: `P`, `F(a)`, `R(a, b)`.
    if (formula.type === "atom") {
      const last = out.at(-1);

      if (last?.kind === "cell" && last.formula === formula) {
        out[out.length - 1] = { ...last, text: last.text + piece.text };
      } else {
        out.push({
          formula,
          isMain: false,
          kind: "cell",
          role: "atom",
          text: piece.text,
        });
      }

      continue;
    }

    if (piece.kind === "space") {
      continue;
    }

    // `⊤` and `⊥` take no operands and are still connectives: a column of
    // constant Ts under the symbol, which is what a student is being asked to
    // notice about them.
    if (piece.kind === "token" && !cellOf.has(formula)) {
      cellOf.add(formula);
      out.push({
        formula,
        isMain: formula === read.formula,
        kind: "cell",
        role: "connective",
        text: piece.text,
      });
      continue;
    }

    out.push({ kind: "mark", text: piece.text });
  }

  return out;
}
