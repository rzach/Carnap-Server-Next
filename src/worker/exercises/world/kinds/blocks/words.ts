/**
 * What the blocks world says about itself: a block's description, the
 * sentence each move is announced with, and the reason for each refusal.
 *
 * Whole phrases, never an adjective glued to a noun: a German "large cube"
 * and "large tet" decline differently, so each of the nine is its own string.
 */

import type { WorldStringId } from "../../strings";
import type { WorldProblem, WorldWords } from "../contract";
import type { BlocksMove } from "./moves";
import type { Block, BlockShape, BlockSize, BlocksState } from "./state";
import { blockById } from "./state";

const KINDS: Readonly<
  Record<BlockSize, Readonly<Record<BlockShape, WorldStringId>>>
> = {
  large: { cube: "large cube", dodec: "large dodec", tet: "large tet" },
  medium: { cube: "medium cube", dodec: "medium dodec", tet: "medium tet" },
  small: { cube: "small cube", dodec: "small dodec", tet: "small tet" },
};

/** `large cube`, in the reader's language. */
export function blockKind(
  shape: BlockShape,
  size: BlockSize,
  words: WorldWords,
): string {
  return words(KINDS[size][shape]);
}

/** The names joined the way a list of them is read: `a, b`. */
function nameList(names: readonly string[]): string {
  return names.join(", ");
}

/**
 * How a sentence refers to a block: by its names where it has any, since
 * those are what the sentences use, and otherwise by its square.
 */
export function blockReference(block: Block, words: WorldWords): string {
  return block.names.length > 0
    ? nameList(block.names)
    : words("the block at column {col}, row {row}", {
        col: String(block.col),
        row: String(block.row),
      });
}

export function reference(
  state: BlocksState,
  id: string | undefined,
  words: WorldWords,
): string {
  const block = id === undefined ? undefined : blockById(state, id);

  return block === undefined ? "?" : blockReference(block, words);
}

export function describeBlock(
  state: BlocksState,
  id: string,
  words: WorldWords,
): string {
  const block = blockById(state, id);

  if (block === undefined) {
    return "";
  }

  const values = {
    block: blockKind(block.shape, block.size, words),
    col: String(block.col),
    row: String(block.row),
  };

  return block.names.length === 0
    ? words("{block} at column {col}, row {row}", values)
    : words("{block} at column {col}, row {row}, named {names}", {
        ...values,
        names: nameList(block.names),
      });
}

export function describeBlocksMove(
  before: BlocksState,
  move: BlocksMove,
  words: WorldWords,
): string {
  if (move.type === "add") {
    return words("Added a {block} at column {col}, row {row}.", {
      block: blockKind(move.block.shape, move.block.size, words),
      col: String(move.block.col),
      row: String(move.block.row),
    });
  }

  const block = blockById(before, move.id);

  if (block === undefined) {
    return "";
  }

  const who = blockReference(block, words);

  switch (move.type) {
    case "remove":
      return words("Removed {block}.", { block: who });
    case "move":
      return words("Moved {block} to column {col}, row {row}.", {
        block: who,
        col: String(move.col),
        row: String(move.row),
      });
    case "shape":
      return words("{block} is now a {kind}.", {
        block: who,
        kind: blockKind(move.shape, block.size, words),
      });
    case "size":
      return words("{block} is now a {kind}.", {
        block: who,
        kind: blockKind(block.shape, move.size, words),
      });
    default:
      return move.names.length === 0
        ? words("{block} has no names now.", { block: who })
        : words("{block} is now named {names}.", {
            block: who,
            names: nameList(move.names),
          });
  }
}

export function describeBlocksProblem(
  state: BlocksState,
  problem: WorldProblem,
  words: WorldWords,
): string {
  const values = problem.values ?? {};
  const first = reference(state, problem.objects[0], words);
  const second = reference(state, problem.objects[1], words);

  switch (problem.code) {
    case "occupied":
      return words("Column {col}, row {row} already holds {block}.", {
        block: first,
        col: values.col ?? "",
        row: values.row ?? "",
      });
    case "off-board":
      return words("That square is off the board.");
    case "too-many":
      return words("A world may hold at most {max} blocks.", {
        max: values.max ?? "",
      });
    case "name-taken":
      return words("{name} already names {block}.", {
        block: first,
        name: values.name ?? "",
      });
    case "shared-square": {
      // Referring to an unnamed block by its square would name the very
      // square in question twice, so here it is called by what it is.
      const called = (id: string | undefined): string => {
        const block = id === undefined ? undefined : blockById(state, id);

        return block === undefined
          ? "?"
          : block.names.length > 0
            ? nameList(block.names)
            : blockKind(block.shape, block.size, words);
      };

      return words(
        "Two blocks share column {col}, row {row}: {block} and {other}.",
        {
          block: called(problem.objects[0]),
          col: values.col ?? "",
          other: called(problem.objects[1]),
          row: values.row ?? "",
        },
      );
    }
    case "shared-name":
      return words("{name} names both {block} and {other}.", {
        block: first,
        name: values.name ?? "",
        other: second,
      });
    default:
      return words("That block is not in this world.");
  }
}
