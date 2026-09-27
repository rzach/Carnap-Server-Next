/**
 * What the `blocks.*` roles mean: the geometry of the board.
 *
 * Every relation is computed from the blocks' attributes when it is asked,
 * never stored. A block's identity in these functions is its id; the world
 * type turns the domain elements a formula talks about into ids before it
 * asks (`../../logic/structure.ts`).
 */

import type { WorldSymbol } from "../contract";
import type { Block, BlocksState } from "./state";
import { blockById, sizeRank } from "./state";

type Relation = (blocks: readonly Block[]) => boolean;

function relation(arity: number, test: Relation): WorldSymbol<BlocksState> {
  return {
    arity,
    holds(state, ids) {
      const blocks: Block[] = [];

      for (const id of ids) {
        const block = blockById(state, id);

        if (block === undefined) {
          return false;
        }

        blocks.push(block);
      }

      return blocks.length === arity && test(blocks);
    },
    kind: "relation",
  };
}

/** A two-place relation over the first and second block. */
function binary(test: (a: Block, b: Block) => boolean) {
  return relation(2, ([a, b]) =>
    a === undefined || b === undefined ? false : test(a, b),
  );
}

/** A one-place property of a block. */
function unary(test: (a: Block) => boolean) {
  return relation(1, ([a]) => (a === undefined ? false : test(a)));
}

/**
 * Whether `a` stands strictly between `b` and `c` on one row, column, or
 * diagonal: `b` and `c` are on such a line, and `a` is one of the squares
 * the line passes through on the way from one to the other.
 */
export function between(a: Block, b: Block, c: Block): boolean {
  const dc = c.col - b.col;
  const dr = c.row - b.row;

  if (dc === 0 && dr === 0) {
    return false;
  }

  if (dc !== 0 && dr !== 0 && Math.abs(dc) !== Math.abs(dr)) {
    return false;
  }

  const steps = Math.max(Math.abs(dc), Math.abs(dr));
  const stepCol = Math.sign(dc);
  const stepRow = Math.sign(dr);

  for (let step = 1; step < steps; step += 1) {
    if (
      a.col === b.col + step * stepCol &&
      a.row === b.row + step * stepRow
    ) {
      return true;
    }
  }

  return false;
}

export const BLOCKS_VOCABULARY: ReadonlyMap<
  string,
  WorldSymbol<BlocksState>
> = new Map([
  ["blocks.tet", unary((a) => a.shape === "tet")],
  ["blocks.cube", unary((a) => a.shape === "cube")],
  ["blocks.dodec", unary((a) => a.shape === "dodec")],
  ["blocks.small", unary((a) => a.size === "small")],
  ["blocks.medium", unary((a) => a.size === "medium")],
  ["blocks.large", unary((a) => a.size === "large")],
  ["blocks.smaller", binary((a, b) => sizeRank(a.size) < sizeRank(b.size))],
  ["blocks.larger", binary((a, b) => sizeRank(a.size) > sizeRank(b.size))],
  ["blocks.same-size", binary((a, b) => a.size === b.size)],
  ["blocks.same-shape", binary((a, b) => a.shape === b.shape)],
  ["blocks.left-of", binary((a, b) => a.col < b.col)],
  ["blocks.right-of", binary((a, b) => a.col > b.col)],
  ["blocks.back-of", binary((a, b) => a.row < b.row)],
  ["blocks.front-of", binary((a, b) => a.row > b.row)],
  ["blocks.same-row", binary((a, b) => a.row === b.row)],
  ["blocks.same-col", binary((a, b) => a.col === b.col)],
  [
    "blocks.adjoins",
    binary((a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1),
  ],
  [
    "blocks.between",
    relation(3, ([a, b, c]) =>
      a === undefined || b === undefined || c === undefined
        ? false
        : between(a, b, c),
    ),
  ],
]);
