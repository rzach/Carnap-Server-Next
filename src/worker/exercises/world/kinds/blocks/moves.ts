/**
 * Editing a blocks world: the moves, and the reducer that applies them.
 *
 * Every change the editor makes — a drag, a key, a menu, a table control —
 * is one of these, so undo, the announcements, and a refusal's reason all
 * come from one place. A move that would break the physics is refused with
 * the reason rather than applied, which is why the editor never holds an
 * illegal world.
 */

import type { WorldProblem } from "../contract";
import type {
  Block,
  BlockShape,
  BlockSize,
  BlockSpec,
  BlocksState,
} from "./state";
import {
  BLOCKS_STATE_TAG,
  blockAt,
  blockById,
  isShape,
  isSize,
  MAX_BLOCKS,
  onBoard,
} from "./state";

export type BlocksMove =
  | { readonly type: "add"; readonly block: Block }
  | { readonly type: "remove"; readonly id: string }
  | {
      readonly type: "move";
      readonly id: string;
      readonly col: number;
      readonly row: number;
    }
  | {
      readonly type: "shape";
      readonly id: string;
      readonly shape: BlockShape;
    }
  | { readonly type: "size"; readonly id: string; readonly size: BlockSize }
  | {
      readonly type: "names";
      readonly id: string;
      readonly names: readonly string[];
    };

function refuse(
  code: string,
  objects: readonly string[],
  values?: Readonly<Record<string, string>>,
): WorldProblem {
  return values === undefined ? { code, objects } : { code, objects, values };
}

function replace(state: BlocksState, next: Block): BlocksState {
  return {
    kind: BLOCKS_STATE_TAG,
    objects: state.objects.map((block) =>
      block.id === next.id ? next : block,
    ),
  };
}

/** The square is free for `id` to stand on, or the refusal saying why not. */
function squareRefusal(
  state: BlocksState,
  col: number,
  row: number,
  id: string,
): WorldProblem | null {
  if (!onBoard(col, row)) {
    return refuse("off-board", [id]);
  }

  const occupant = blockAt(state, col, row);

  return occupant === undefined || occupant.id === id
    ? null
    : refuse("occupied", [occupant.id], {
        col: String(col),
        row: String(row),
      });
}

/** The first of `names` another block already has, as a refusal. */
function nameRefusal(
  state: BlocksState,
  names: readonly string[],
  id: string,
): WorldProblem | null {
  for (const name of names) {
    const holder = state.objects.find(
      (block) => block.id !== id && block.names.includes(name),
    );

    if (holder !== undefined) {
      return refuse("name-taken", [holder.id], { name });
    }
  }

  return null;
}

export function applyBlocksMove(
  state: BlocksState,
  move: BlocksMove,
): BlocksState | WorldProblem {
  if (move.type === "add") {
    if (blockById(state, move.block.id) !== undefined) {
      return refuse("unknown-object", [move.block.id]);
    }

    if (state.objects.length >= MAX_BLOCKS) {
      return refuse("too-many", [], { max: String(MAX_BLOCKS) });
    }

    const refusal =
      squareRefusal(state, move.block.col, move.block.row, move.block.id) ??
      nameRefusal(state, move.block.names, move.block.id);

    return (
      refusal ?? {
        kind: BLOCKS_STATE_TAG,
        objects: [...state.objects, move.block],
      }
    );
  }

  const block = blockById(state, move.id);

  if (block === undefined) {
    return refuse("unknown-object", [move.id]);
  }

  switch (move.type) {
    case "remove":
      return {
        kind: BLOCKS_STATE_TAG,
        objects: state.objects.filter((other) => other.id !== move.id),
      };
    case "move":
      return (
        squareRefusal(state, move.col, move.row, move.id) ??
        replace(state, { ...block, col: move.col, row: move.row })
      );
    case "shape":
      return replace(state, { ...block, shape: move.shape });
    case "size":
      return replace(state, { ...block, size: move.size });
    default: {
      const names = [...new Set(move.names)];

      return (
        nameRefusal(state, names, move.id) ??
        replace(state, { ...block, names })
      );
    }
  }
}

function isStringList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

/** Untrusted JSON as a move, by shape; reserved for a recorded move log. */
export function parseBlocksMove(json: unknown): BlocksMove | null {
  if (typeof json !== "object" || json === null) {
    return null;
  }

  const move = json as Record<string, unknown>;
  const id = move.id;

  switch (move.type) {
    case "add": {
      const block = move.block as Record<string, unknown> | null;

      return typeof block === "object" &&
        block !== null &&
        typeof block.id === "string" &&
        isShape(block.shape) &&
        isSize(block.size) &&
        typeof block.col === "number" &&
        typeof block.row === "number" &&
        isStringList(block.names)
        ? {
            block: {
              col: block.col,
              id: block.id,
              names: block.names,
              row: block.row,
              shape: block.shape,
              size: block.size,
            },
            type: "add",
          }
        : null;
    }
    case "remove":
      return typeof id === "string" ? { id, type: "remove" } : null;
    case "move":
      return typeof id === "string" &&
        typeof move.col === "number" &&
        typeof move.row === "number"
        ? { col: move.col, id, row: move.row, type: "move" }
        : null;
    case "shape":
      return typeof id === "string" && isShape(move.shape)
        ? { id, shape: move.shape, type: "shape" }
        : null;
    case "size":
      return typeof id === "string" && isSize(move.size)
        ? { id, size: move.size, type: "size" }
        : null;
    case "names":
      return typeof id === "string" && isStringList(move.names)
        ? { id, names: move.names, type: "names" }
        : null;
    default:
      return null;
  }
}

function sameBlock(a: Block, b: Block): boolean {
  return (
    a.shape === b.shape &&
    a.size === b.size &&
    a.col === b.col &&
    a.row === b.row &&
    a.names.length === b.names.length &&
    a.names.every((name) => b.names.includes(name))
  );
}

/**
 * How many blocks differ between two worlds: added, removed, or changed in
 * any attribute, each counted once. A block moved and reshaped is one change,
 * because a budget of "change at most two blocks" is a budget of blocks.
 *
 * Blocks are matched by id, and the ids come from the answer. That cannot be
 * gamed: any matching the student picks counts at least as many changes as
 * the best one, so choosing their own ids can only bring the count down to the
 * true minimum, which is what a budget means.
 */
export function blocksDistance(from: BlocksState, to: BlocksState): number {
  let changes = 0;

  for (const block of from.objects) {
    const after = blockById(to, block.id);

    if (after === undefined || !sameBlock(block, after)) {
      changes += 1;
    }
  }

  for (const block of to.objects) {
    if (blockById(from, block.id) === undefined) {
      changes += 1;
    }
  }

  return changes;
}

/** The pinned blocks `to` has moved, changed, or removed. */
export function blocksPinViolations(
  from: BlocksState,
  to: BlocksState,
  pinned: ReadonlySet<string>,
): readonly string[] {
  return from.objects.flatMap((block) => {
    if (!pinned.has(block.id)) {
      return [];
    }

    const after = blockById(to, block.id);

    return after !== undefined && sameBlock(block, after) ? [] : [block.id];
  });
}

/** A world from authored lines, with ids `o1…on` in source order. */
export function buildBlocks(specs: readonly BlockSpec[]): BlocksState {
  return {
    kind: BLOCKS_STATE_TAG,
    objects: specs.map((spec, index) => ({ ...spec, id: `o${index + 1}` })),
  };
}
