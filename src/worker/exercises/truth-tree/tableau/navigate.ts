/**
 * Moving a cursor around a tableau, and the keys that do it.
 *
 * The cursor is on a row, or on a branch's end mark, which is named by its
 * node's id. Up and down follow the branch; down at a split takes the
 * leftmost branch, and the end mark is the last stop below a branch's rows.
 * Left and right go to the nearest row or end mark in the neighbouring
 * columns, on the same line where there is one. The keys are
 * named as actions, so an editor maps a key to what it means here and decides
 * for itself what `stack` or `close` does; the editor's map is
 * `client/components/truth-tree-keys.ts`.
 */

import type { TableauIndex, TableauNode } from "./document";
import type { TableauLayout } from "./layout";

export type Direction = "up" | "down" | "left" | "right";

export function moveCursor(
  index: TableauIndex,
  layout: TableauLayout,
  itemId: string,
  direction: Direction,
): string | null {
  const end = layout.ends.get(itemId);
  const location = index.row(itemId);
  const placed = end ?? layout.rows.get(itemId);

  if ((end === undefined && location === null) || placed === undefined) {
    return null;
  }

  if (direction === "up") {
    const above =
      location === null ? index.branchRows(itemId) : index.rowsAbove(itemId);
    return above[above.length - 1]?.id ?? null;
  }

  if (direction === "down") {
    if (location === null) {
      return null;
    }

    const next = location.node.rows[location.index + 1];

    if (next !== undefined) {
      return next.id;
    }

    // The branch's end mark, or the first row below, through any empty
    // nodes, down the leftmost path.
    let node: TableauNode | undefined = location.node;

    while (node !== undefined) {
      if (node !== location.node && node.rows[0] !== undefined) {
        return node.rows[0].id;
      }

      if (layout.ends.has(node.id)) {
        return node.id;
      }

      node = index.children(node.id)[0];
    }

    return null;
  }

  let best: { id: string; column: number; line: number } | null = null;

  for (const [id, other] of [...layout.rows, ...layout.ends]) {
    const column =
      direction === "left"
        ? placed.span.start - other.span.end
        : other.span.start - placed.span.end;

    if (column < 0) {
      continue;
    }

    const line = Math.abs(other.line - placed.line);

    if (
      best === null ||
      column < best.column ||
      (column === best.column && line < best.line)
    ) {
      best = { column, id, line };
    }
  }

  return best?.id ?? null;
}

/** What a key asks a tableau editor to do. */
export type TableauKeyAction =
  | Direction
  | "first"
  | "last"
  | "edit"
  | "cite"
  | "rule"
  | "stack"
  | "split"
  | "add-row"
  | "close"
  | "open"
  | "delete"
  | "undo"
  | "redo";
