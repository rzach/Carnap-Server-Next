/**
 * One authored block: `large cube at 3,5 named a, b`.
 *
 * The size and the shape may come in either order and the names are
 * optional; the square is always `at column,row`. {@link formatBlockLine}
 * writes the canonical order back, which is what the author preview's "Copy
 * as source" emits.
 */

import type { WorldProblem } from "../contract";
import type { BlockShape, BlockSize, BlockSpec, BlocksState } from "./state";
import { blockById, isShape, isSize, onBoard } from "./state";

const LINE =
  /^\s*(?<first>[A-Za-z]+)\s+(?<second>[A-Za-z]+)\s+at\s+(?<col>\d+)\s*,\s*(?<row>\d+)\s*(?:named\s+(?<names>.+?))?\s*$/;

function problem(
  code: string,
  values?: Readonly<Record<string, string>>,
): WorldProblem {
  return values === undefined
    ? { code, objects: [] }
    : { code, objects: [], values };
}

export function parseBlockLine(text: string): BlockSpec | WorldProblem {
  const match = LINE.exec(text);
  const groups = match?.groups;

  if (groups === undefined) {
    return problem("object-syntax");
  }

  const words = [groups.first, groups.second].map((word) =>
    (word ?? "").toLowerCase(),
  );
  const shape = words.find(isShape) as BlockShape | undefined;
  const size = words.find(isSize) as BlockSize | undefined;

  if (shape === undefined || size === undefined) {
    const unknown = words.find((word) => !isShape(word) && !isSize(word));

    return problem("object-attribute", { word: unknown ?? words[0] ?? "" });
  }

  const col = Number.parseInt(groups.col ?? "", 10);
  const row = Number.parseInt(groups.row ?? "", 10);

  if (!onBoard(col, row)) {
    return problem("object-square", {
      col: String(col),
      row: String(row),
    });
  }

  const names =
    groups.names === undefined
      ? []
      : groups.names
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name.length > 0);

  return { col, names, row, shape, size };
}

export function formatBlockLine(state: BlocksState, id: string): string {
  const block = blockById(state, id);

  if (block === undefined) {
    return "";
  }

  const named =
    block.names.length === 0 ? "" : ` named ${block.names.join(", ")}`;

  return `${block.size} ${block.shape} at ${block.col},${block.row}${named}`;
}
