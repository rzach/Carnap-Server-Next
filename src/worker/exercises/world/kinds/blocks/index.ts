import type { WorldKind, WorldProblem, WorldWords } from "../contract";
import { drawBlocks } from "./draw";
import type { BlocksMove } from "./moves";
import {
  applyBlocksMove,
  blocksDistance,
  blocksPinViolations,
  buildBlocks,
  parseBlocksMove,
} from "./moves";
import { formatBlockLine, parseBlockLine } from "./object-line";
import type { BlockSpec, BlocksState } from "./state";
import {
  BLOCKS_STATE_TAG,
  blocksProblems,
  MAX_BLOCKS,
  parseBlocksState,
} from "./state";
import { BLOCKS_VOCABULARY } from "./vocabulary";
import {
  describeBlock,
  describeBlocksMove,
  describeBlocksProblem,
  reference,
} from "./words";

/** The blocks world: Tarski's World's board, in its own words. */
export const BLOCKS_KIND = {
  apply: applyBlocksMove,
  build: buildBlocks,
  describeMove: describeBlocksMove,
  describeObject: describeBlock,
  describeProblem: describeBlocksProblem,
  distance: blocksDistance,
  draw: drawBlocks,
  empty: () => ({ kind: BLOCKS_STATE_TAG, objects: [] }),
  formatObject: formatBlockLine,
  id: "blocks",
  isRefusal: (value: BlocksState | WorldProblem): value is WorldProblem =>
    "code" in value,
  maxObjects: MAX_BLOCKS,
  nameObject: (state: BlocksState, id: string, words: WorldWords) =>
    reference(state, id, words),
  objectKey: "block",
  objects: (state: BlocksState) => state.objects,
  parseMove: parseBlocksMove,
  parseObject: parseBlockLine,
  parseState: parseBlocksState,
  pinViolations: blocksPinViolations,
  problems: blocksProblems,
  roleNamespace: "blocks",
  version: 1,
  vocabulary: BLOCKS_VOCABULARY,
} satisfies WorldKind<BlocksState, BlocksMove, BlockSpec>;

export { blockGlyph } from "./draw";
export type { BlocksMove } from "./moves";
export type { Block, BlockShape, BlockSize, BlocksState } from "./state";
export { BOARD_SIZE, SHAPES, SIZES } from "./state";
export { blockKind, blockReference } from "./words";
