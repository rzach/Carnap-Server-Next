/**
 * A blocks world as a picture: each block a glyph in its square's 100 × 100
 * box. Shape and size carry the meaning — a triangle, a square, or a
 * pentagon, at three sizes — so colour is never the only signal, and every
 * colour comes from a class the stylesheet maps to the exercise tokens.
 */

import type { DrawPrimitive, GridDrawing } from "../contract";
import type { Block, BlockShape, BlockSize, BlocksState } from "./state";
import { BOARD_SIZE } from "./state";

const SCALE: Readonly<Record<BlockSize, number>> = {
  large: 1,
  medium: 0.78,
  small: 0.58,
};

function point(x: number, y: number): string {
  return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
}

/** A regular polygon's corners, first corner straight up. */
function regular(sides: number, radius: number, cy = 50): string {
  return Array.from({ length: sides }, (_, corner) => {
    const angle = -Math.PI / 2 + (corner * 2 * Math.PI) / sides;
    return point(
      50 + radius * Math.cos(angle),
      cy + radius * Math.sin(angle),
    );
  }).join(" ");
}

function outline(shape: BlockShape, scale: number): DrawPrimitive {
  const className = `block-body block-${shape}`;

  switch (shape) {
    case "tet":
      // Centred on its centroid rather than its box, so a triangle sits in
      // the middle of its square the way the other two do.
      return { className, el: "polygon", points: regular(3, 46 * scale, 56) };
    case "cube": {
      const side = 72 * scale;
      return {
        className,
        el: "rect",
        height: side,
        width: side,
        x: 50 - side / 2,
        y: 50 - side / 2,
      };
    }
    default:
      return { className, el: "polygon", points: regular(5, 42 * scale, 52) };
  }
}

export function blockGlyph(block: Block): readonly DrawPrimitive[] {
  const glyph: DrawPrimitive[] = [outline(block.shape, SCALE[block.size])];

  if (block.names.length > 0) {
    glyph.push({
      className: `block-name block-name-${block.size}`,
      el: "text",
      text: block.names.join(","),
      x: 50,
      // The optical centre of each shape, which for a triangle is low.
      y: block.shape === "tet" ? 62 : block.shape === "dodec" ? 55 : 51,
    });
  }

  return glyph;
}

export function drawBlocks(state: BlocksState): GridDrawing {
  return {
    columns: BOARD_SIZE,
    layout: "grid",
    pieces: state.objects.map((block) => ({
      col: block.col,
      glyph: blockGlyph(block),
      id: block.id,
      row: block.row,
    })),
    rows: BOARD_SIZE,
  };
}
