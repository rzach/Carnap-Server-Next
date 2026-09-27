/**
 * What the blocks world says about itself: a block's description, the
 * sentence each move is announced with, and the reason for each refusal.
 *
 * Whole phrases, never an adjective glued to a noun: a German "large cube"
 * and "large tet" decline differently, so each of the nine is its own string.
 */

import type { WorldStringId } from "../../strings";
import type { ObjectSentence, WorldProblem, WorldWords } from "../contract";
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
 * How a list refers to a block: by its names where it has any, since those
 * are what the sentences use, and otherwise by its square. A sentence about
 * one block is worded whole instead ({@link aboutBlock}).
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

/**
 * A sentence about one block, in its form for a named block or an unnamed
 * one. Whole sentences rather than a reference dropped into one: where the
 * square falls, what case it takes, and whether it opens the sentence (and so
 * is capitalized) are the translation's to decide — "the block at column 2"
 * begins a German sentence that its English puts last.
 */
function aboutBlock(
  block: Block,
  named: WorldStringId,
  unnamed: WorldStringId,
  words: WorldWords,
  values: Readonly<Record<string, string>> = {},
): string {
  return block.names.length > 0
    ? words(named, { ...values, block: nameList(block.names) })
    : words(unnamed, {
        ...values,
        col: String(block.col),
        row: String(block.row),
      });
}

const OBJECT_SENTENCES: Readonly<
  Record<ObjectSentence, readonly [WorldStringId, WorldStringId]>
> = {
  "picked-up": [
    "Picked up {block}. Arrow keys carry it, Enter drops it, Escape puts it back.",
    "Picked up the block at column {col}, row {row}. Arrow keys carry it, Enter drops it, Escape puts it back.",
  ],
  pinned: [
    "{block} is pinned and cannot be changed.",
    "The block at column {col}, row {row} is pinned and cannot be changed.",
  ],
  "put-back": [
    "Put {block} back.",
    "Put the block at column {col}, row {row} back.",
  ],
};

export function objectSentence(
  state: BlocksState,
  id: string,
  sentence: ObjectSentence,
  words: WorldWords,
): string {
  const block = blockById(state, id);
  const [named, unnamed] = OBJECT_SENTENCES[sentence];

  return block === undefined ? "" : aboutBlock(block, named, unnamed, words);
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

  switch (move.type) {
    case "remove":
      return aboutBlock(
        block,
        "Removed {block}.",
        "Removed the block at column {col}, row {row}.",
        words,
      );
    case "move":
      // Two squares, so the unnamed form names the one it left as `from`.
      return block.names.length > 0
        ? words("Moved {block} to column {col}, row {row}.", {
            block: nameList(block.names),
            col: String(move.col),
            row: String(move.row),
          })
        : words(
            "Moved the block at column {fromCol}, row {fromRow} to column {col}, row {row}.",
            {
              col: String(move.col),
              fromCol: String(block.col),
              fromRow: String(block.row),
              row: String(move.row),
            },
          );
    case "shape":
    case "size":
      return aboutBlock(
        block,
        "{block} is now a {kind}.",
        "The block at column {col}, row {row} is now a {kind}.",
        words,
        {
          kind:
            move.type === "shape"
              ? blockKind(move.shape, block.size, words)
              : blockKind(block.shape, move.size, words),
        },
      );
    default:
      return move.names.length === 0
        ? aboutBlock(
            block,
            "{block} has no names now.",
            "The block at column {col}, row {row} has no names now.",
            words,
          )
        : aboutBlock(
            block,
            "{block} is now named {names}.",
            "The block at column {col}, row {row} is now named {names}.",
            words,
            { names: nameList(move.names) },
          );
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
    case "occupied": {
      // The square is already named, so an unnamed block is just "a block".
      const square = { col: values.col ?? "", row: values.row ?? "" };
      const holder =
        problem.objects[0] === undefined
          ? undefined
          : blockById(state, problem.objects[0]);

      return holder !== undefined && holder.names.length > 0
        ? words("Column {col}, row {row} already holds {block}.", {
            ...square,
            block: nameList(holder.names),
          })
        : words("Column {col}, row {row} already holds a block.", square);
    }
    case "off-board":
      return words("That square is off the board.");
    case "too-many":
      return words("A world may hold at most {max} blocks.", {
        max: values.max ?? "",
      });
    case "name-taken":
      // The block holding a name is named, so no unnamed form is needed; the
      // same goes for the two blocks sharing one below.
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
