/**
 * A world drawing as server markup: the board the preview, the inert first
 * paint, and the review page all show. The editor island renders the same
 * {@link WorldDrawing} through the same primitives, so the two cannot drift.
 */

import { escapeHtml } from "../../application/content/render-support";
import type { DrawPrimitive, WorldDrawing } from "./kinds/contract";

/** One primitive as an SVG element, in its piece's 100 × 100 box. */
export function primitiveSvg(primitive: DrawPrimitive): string {
  const className = `class="${escapeHtml(primitive.className)}"`;

  switch (primitive.el) {
    case "polygon":
      return `<polygon ${className} points="${escapeHtml(primitive.points)}"/>`;
    case "rect":
      return `<rect ${className} x="${primitive.x}" y="${primitive.y}" width="${primitive.width}" height="${primitive.height}"/>`;
    case "circle":
      return `<circle ${className} cx="${primitive.cx}" cy="${primitive.cy}" r="${primitive.r}"/>`;
    default:
      return `<text ${className} x="${primitive.x}" y="${primitive.y}">${escapeHtml(primitive.text)}</text>`;
  }
}

export function glyphSvg(glyph: readonly DrawPrimitive[]): string {
  return `<svg aria-hidden="true" class="world-glyph" focusable="false" viewBox="0 0 100 100">${glyph.map(primitiveSvg).join("")}</svg>`;
}

/**
 * The board: column numbers across the top, row numbers down the side, and a
 * square per cell with its piece, if any, drawn in it. Decorative to a
 * screen reader — the object table beside it says the same thing in words,
 * and it is the table that is announced.
 */
export function boardHtml(
  drawing: WorldDrawing,
  options: { readonly label: string; readonly pinned?: ReadonlySet<string> },
): string {
  const byCell = new Map(
    drawing.pieces.map((piece) => [`${piece.col},${piece.row}`, piece]),
  );
  const cells: string[] = ['<span class="world-axis world-corner"></span>'];

  for (let col = 1; col <= drawing.columns; col += 1) {
    cells.push(`<span class="world-axis world-axis-col">${col}</span>`);
  }

  for (let row = 1; row <= drawing.rows; row += 1) {
    cells.push(`<span class="world-axis world-axis-row">${row}</span>`);

    for (let col = 1; col <= drawing.columns; col += 1) {
      const piece = byCell.get(`${col},${row}`);
      const shade = (col + row) % 2 === 0 ? "light" : "dark";
      const pinned =
        piece !== undefined && options.pinned?.has(piece.id) === true;

      cells.push(
        `<span class="world-cell" data-shade="${shade}"${pinned ? " data-pinned" : ""}>${piece === undefined ? "" : glyphSvg(piece.glyph)}${pinned ? '<span class="world-pin"></span>' : ""}</span>`,
      );
    }
  }

  return `<div aria-hidden="true" class="world-board" data-label="${escapeHtml(options.label)}">${cells.join("")}</div>`;
}
