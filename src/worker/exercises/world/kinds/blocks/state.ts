/**
 * The blocks world's state: an 8 × 8 board of blocks, each with one shape,
 * one size, one square, and any number of names.
 *
 * Columns run 1–8 left to right and rows 1–8 back to front, so row 8 is the
 * one nearest the viewer. That is Barwise and Etchemendy's orientation, and
 * the one `BackOf` and `FrontOf` are defined by.
 */

import type { WorldProblem } from "../contract";

export const BLOCKS_STATE_TAG = "blocks@1";
export const BOARD_SIZE = 8;
export const MAX_BLOCKS = 16;

export const SHAPES = ["tet", "cube", "dodec"] as const;
export const SIZES = ["small", "medium", "large"] as const;

export type BlockShape = (typeof SHAPES)[number];
export type BlockSize = (typeof SIZES)[number];

export interface Block {
  readonly id: string;
  readonly shape: BlockShape;
  readonly size: BlockSize;
  readonly col: number;
  readonly row: number;
  readonly names: readonly string[];
}

export interface BlocksState {
  readonly kind: typeof BLOCKS_STATE_TAG;
  readonly objects: readonly Block[];
}

/** An authored block before it has an id: one `| block : …` line, read. */
export type BlockSpec = Omit<Block, "id">;

export function isShape(value: unknown): value is BlockShape {
  return SHAPES.includes(value as BlockShape);
}

export function isSize(value: unknown): value is BlockSize {
  return SIZES.includes(value as BlockSize);
}

/** Small < medium < large, as a number to compare. */
export function sizeRank(size: BlockSize): number {
  return SIZES.indexOf(size);
}

export function onBoard(col: number, row: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 1 &&
    col <= BOARD_SIZE &&
    row >= 1 &&
    row <= BOARD_SIZE
  );
}

/** The block standing on a square, if any. */
export function blockAt(
  state: BlocksState,
  col: number,
  row: number,
): Block | undefined {
  return state.objects.find(
    (block) => block.col === col && block.row === row,
  );
}

export function blockById(state: BlocksState, id: string): Block | undefined {
  return state.objects.find((block) => block.id === id);
}

/** Id shape: what the editor mints and an author's `o1…on` both satisfy. */
const ID = /^[A-Za-z0-9_-]{1,32}$/;

/** A name as it may be stored; whether the language has it is checked elsewhere. */
const NAME = /^\S{1,32}$/u;

function parseBlock(json: unknown): Block | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return null;
  }

  const value = json as Record<string, unknown>;
  const names = value.names;

  if (
    typeof value.id !== "string" ||
    !ID.test(value.id) ||
    !isShape(value.shape) ||
    !isSize(value.size) ||
    typeof value.col !== "number" ||
    typeof value.row !== "number" ||
    !onBoard(value.col, value.row) ||
    !Array.isArray(names) ||
    names.length > MAX_BLOCKS ||
    !names.every((name) => typeof name === "string" && NAME.test(name))
  ) {
    return null;
  }

  return {
    col: value.col,
    id: value.id,
    names: [...(names as string[])],
    row: value.row,
    shape: value.shape,
    size: value.size,
  };
}

/**
 * Untrusted JSON as a state, by shape alone.
 *
 * A block off the board, with an unknown shape, or with a repeated id is not
 * a blocks world at all and is refused here. Two blocks on one square, a name
 * on two blocks, or seventeen blocks are worlds that break the physics:
 * well-formed, and scored zero with the reason by {@link blocksProblems}.
 * The list is bounded generously so a hostile payload cannot make the checks
 * quadratic in something large.
 */
export function parseBlocksState(json: unknown): BlocksState | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return null;
  }

  const value = json as Record<string, unknown>;

  if (
    value.kind !== BLOCKS_STATE_TAG ||
    !Array.isArray(value.objects) ||
    value.objects.length > BOARD_SIZE * BOARD_SIZE
  ) {
    return null;
  }

  const objects: Block[] = [];
  const ids = new Set<string>();

  for (const entry of value.objects) {
    const block = parseBlock(entry);

    if (block === null || ids.has(block.id)) {
      return null;
    }

    ids.add(block.id);
    objects.push(block);
  }

  return { kind: BLOCKS_STATE_TAG, objects };
}

/** Everything physically wrong with a state, in a stable order. */
export function blocksProblems(state: BlocksState): readonly WorldProblem[] {
  const problems: WorldProblem[] = [];

  if (state.objects.length > MAX_BLOCKS) {
    problems.push({
      code: "too-many",
      objects: [],
      values: { max: String(MAX_BLOCKS) },
    });
  }

  const squares = new Map<string, string>();
  const named = new Map<string, string>();

  for (const block of state.objects) {
    const square = `${block.col},${block.row}`;
    const other = squares.get(square);

    if (other === undefined) {
      squares.set(square, block.id);
    } else {
      problems.push({
        code: "shared-square",
        objects: [other, block.id],
        values: { col: String(block.col), row: String(block.row) },
      });
    }

    for (const name of block.names) {
      const holder = named.get(name);

      if (holder === undefined) {
        named.set(name, block.id);
      } else if (holder !== block.id) {
        problems.push({
          code: "shared-name",
          objects: [holder, block.id],
          values: { name },
        });
      }
    }
  }

  return problems;
}
