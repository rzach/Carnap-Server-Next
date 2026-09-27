/** @jsxImportSource preact */
/**
 * `<carnap-world>` — the interactive world editor.
 *
 * The server renders the world into a Declarative Shadow Root, inert and
 * correctly drawn with no JS (see the worker-side `renderWorldElement`). On
 * connect this element replaces that body with a Preact island: a board the
 * student edits with a pointer or the keyboard, a table of the same objects
 * made of native controls, and the sentences with their live truth values.
 *
 * Every change goes through the world kind's `apply`, so the editor is a
 * reducer over typed moves: undo is a stack of states, a refusal carries its
 * reason, and each change is announced in a polite live region. The editor
 * never holds a world that breaks the physics — two blocks on a square, a name
 * on two blocks — because the kind refuses the move that would make one.
 *
 * As with the model, there is no answer key: the Check runs the very
 * `judgeWorld` the worker grades with, over public data.
 */

import { render } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ResolvedWorld } from "../../worker/exercises/world/grading";
import {
  isWorldPublicData,
  resolveWorld,
} from "../../worker/exercises/world/grading";
import type {
  BlockShape,
  BlockSize,
  BlocksMove,
  BlocksState,
} from "../../worker/exercises/world/kinds/blocks";
import {
  BOARD_SIZE,
  blockGlyph,
  SHAPES,
  SIZES,
} from "../../worker/exercises/world/kinds/blocks";
import type {
  DrawPrimitive,
  WorldKind,
  WorldWords,
} from "../../worker/exercises/world/kinds/contract";
import type { TruthValue } from "../../worker/exercises/world/logic/check";
import {
  judgeDistinguish,
  judgeWorld,
  truthValues,
} from "../../worker/exercises/world/logic/check";
import { languageNames } from "../../worker/exercises/world/logic/structure";
import type { WorldStringId } from "../../worker/exercises/world/strings";
import type {
  WorldAnswerData,
  WorldPublicData,
} from "../../worker/exercises/world/types";
import { describeWorldVerdict } from "../../worker/exercises/world/verdict-text";
import { CarnapExerciseElement, register } from "./base";
import islandStyles from "./carnap-world-v1.css" with { type: "text" };
import {
  createHelpDialog,
  HELP_DIALOG_STYLES,
  mountHelpTrigger,
  openHelpDialog,
} from "./help-dialog";
import { ToolbarIcon } from "./toolbar-icon";
import { TOOLBAR_STYLES, type ToolbarIconName } from "./toolbar-icons";
import type { Highlight } from "./world-highlight";
import { FormulaView, highlightAnnouncement } from "./world-highlight";

const HISTORY_LIMIT = 100;

type Words = WorldWords;

interface Cursor {
  readonly col: number;
  readonly row: number;
}

/** A block picked up to be carried to another square. */
interface Carry {
  readonly id: string;
}

/** The blocks-specific moves the editor makes, and the state it makes them on. */
type Blocks = WorldKind<BlocksState, BlocksMove>;

function asBlocks(kind: WorldKind): Blocks {
  return kind as Blocks;
}

// ---------------------------------------------------------------------------
// Drawing.
// ---------------------------------------------------------------------------

function Primitive({ primitive }: { readonly primitive: DrawPrimitive }) {
  switch (primitive.el) {
    case "polygon":
      return (
        <polygon class={primitive.className} points={primitive.points} />
      );
    case "rect":
      return (
        <rect
          class={primitive.className}
          height={primitive.height}
          width={primitive.width}
          x={primitive.x}
          y={primitive.y}
        />
      );
    case "circle":
      return (
        <circle
          class={primitive.className}
          cx={primitive.cx}
          cy={primitive.cy}
          r={primitive.r}
        />
      );
    default:
      return (
        <text class={primitive.className} x={primitive.x} y={primitive.y}>
          {primitive.text}
        </text>
      );
  }
}

function Glyph({ glyph }: { readonly glyph: readonly DrawPrimitive[] }) {
  return (
    <svg
      aria-hidden="true"
      class="world-glyph"
      focusable="false"
      viewBox="0 0 100 100"
    >
      {glyph.map((primitive, index) => (
        <Primitive key={index} primitive={primitive} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The board.
// ---------------------------------------------------------------------------

interface BoardProps {
  readonly carry: Carry | null;
  readonly cursor: Cursor;
  readonly editable: boolean;
  readonly focusCursor: boolean;
  /** Objects to ring, keyed by id, with how to ring them. */
  readonly highlight: Highlight | null;
  readonly kind: Blocks;
  readonly label: string;
  readonly onCellPointer: (cell: Cursor, pointerType: string) => void;
  readonly onDragMove: (id: string, to: Cursor) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onPaletteDrop: (shape: BlockShape, to: Cursor) => void;
  readonly pinned: ReadonlySet<string>;
  readonly state: BlocksState;
  readonly words: Words;
}

/** The cell a pointer is over, read off the elements under it. */
function cellAt(root: ShadowRoot | Document, x: number, y: number) {
  for (const element of root.elementsFromPoint(x, y)) {
    const cell = (element as HTMLElement).closest?.<HTMLElement>(
      "[data-col][data-row]",
    );

    if (cell != null) {
      return {
        col: Number(cell.dataset.col),
        row: Number(cell.dataset.row),
      };
    }
  }

  return null;
}

function Board(props: BoardProps) {
  const { state, kind, words, cursor, carry } = props;
  const gridRef = useRef<HTMLTableElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState<Cursor | null>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    /** Where in its square the block was taken hold of. */
    grab: { x: number; y: number };
    size: number;
    moved: boolean;
  } | null>(null);
  // A copy of the dragged block under the pointer, in the frame's
  // coordinates, so a drag shows what is being carried.
  const [dragGhost, setDragGhost] = useState<{
    id: string;
    x: number;
    y: number;
    size: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!props.focusCursor) {
      return;
    }

    gridRef.current
      ?.querySelector<HTMLElement>(
        `[data-col="${cursor.col}"][data-row="${cursor.row}"]`,
      )
      ?.focus({ preventScroll: false });
  });

  const byCell = new Map(
    state.objects.map((block) => [`${block.col},${block.row}`, block]),
  );
  const carried =
    carry === null
      ? undefined
      : state.objects.find((block) => block.id === carry.id);
  const root = (): ShadowRoot | Document =>
    (gridRef.current?.getRootNode() as ShadowRoot | Document | undefined) ??
    document;

  const onPointerDown = (event: PointerEvent, cell: Cursor): void => {
    const block = byCell.get(`${cell.col},${cell.row}`);

    if (!props.editable || block === undefined || event.button !== 0) {
      return;
    }

    const square = (event.currentTarget as HTMLElement)
      .querySelector(".world-square")
      ?.getBoundingClientRect();

    drag.current = {
      grab: {
        x: event.clientX - (square?.left ?? event.clientX),
        y: event.clientY - (square?.top ?? event.clientY),
      },
      id: block.id,
      moved: false,
      size: square?.width ?? 0,
      x: event.clientX,
      y: event.clientY,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const current = drag.current;

    if (current === null) {
      return;
    }

    if (
      !current.moved &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6
    ) {
      current.moved = true;
    }

    if (current.moved) {
      setDragOver(cellAt(root(), event.clientX, event.clientY));

      const frame = frameRef.current?.getBoundingClientRect();

      if (frame !== undefined) {
        setDragGhost({
          id: current.id,
          size: current.size,
          x: event.clientX - frame.left - current.grab.x,
          y: event.clientY - frame.top - current.grab.y,
        });
      }
    }
  };

  const onPointerUp = (event: PointerEvent, cell: Cursor): void => {
    const current = drag.current;
    drag.current = null;
    setDragOver(null);
    setDragGhost(null);

    if (current?.moved) {
      const to = cellAt(root(), event.clientX, event.clientY);

      if (to !== null && (to.col !== cell.col || to.row !== cell.row)) {
        props.onDragMove(current.id, to);
      }

      return;
    }

    props.onCellPointer(cell, event.pointerType);
  };

  const onPointerCancel = (): void => {
    drag.current = null;
    setDragOver(null);
    setDragGhost(null);
  };

  const dragged =
    dragGhost === null
      ? undefined
      : state.objects.find((block) => block.id === dragGhost.id);

  const rows = [];

  const head = (
    <tr>
      <td aria-hidden="true" class="world-axis world-corner" />
      {Array.from({ length: BOARD_SIZE }, (_, index) => (
        <th class="world-axis world-axis-col" key={index} scope="col">
          {index + 1}
        </th>
      ))}
    </tr>
  );

  for (let row = 1; row <= BOARD_SIZE; row += 1) {
    const cells = [];

    for (let col = 1; col <= BOARD_SIZE; col += 1) {
      const block = byCell.get(`${col},${row}`);
      const here = cursor.col === col && cursor.row === row;
      const isCarried =
        block !== undefined &&
        (block.id === carry?.id || block.id === dragGhost?.id);
      const ghost =
        carried !== undefined && here && !isCarried ? carried : undefined;
      const ring =
        block === undefined
          ? undefined
          : props.highlight?.rings.get(block.id);
      const description =
        block === undefined
          ? words("Column {col}, row {row}", {
              col: String(col),
              row: String(row),
            })
          : words("Column {col}, row {row}: {block}", {
              block: kind.describeObject(state, block.id, words),
              col: String(col),
              row: String(row),
            });
      const over = dragOver?.col === col && dragOver?.row === row;

      cells.push(
        <td
          aria-label={description}
          aria-selected={here ? "true" : "false"}
          class="world-cell"
          data-carried={isCarried ? "" : undefined}
          data-col={col}
          data-cursor={here ? "" : undefined}
          data-object={block?.id}
          data-drop={over ? "" : undefined}
          data-pinned={
            block !== undefined && props.pinned.has(block.id) ? "" : undefined
          }
          data-ring={ring}
          data-row={row}
          data-shade={(col + row) % 2 === 0 ? "light" : "dark"}
          key={`${col},${row}`}
          onDragOver={(event) => {
            if (props.editable) {
              event.preventDefault();
              setDragOver({ col, row });
            }
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(null);
            const shape = event.dataTransfer?.getData("text/x-carnap-shape");

            if (
              shape !== undefined &&
              (SHAPES as readonly string[]).includes(shape)
            ) {
              props.onPaletteDrop(shape as BlockShape, { col, row });
            }
          }}
          onPointerDown={(event) => onPointerDown(event, { col, row })}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => onPointerUp(event, { col, row })}
          onPointerCancel={onPointerCancel}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: in a table with role="grid" a cell is a gridcell; saying so lets it carry aria-selected.
          role="gridcell"
          tabIndex={here ? 0 : -1}
        >
          <div class="world-square">
            {block === undefined ? null : <Glyph glyph={blockGlyph(block)} />}
            {block !== undefined && props.pinned.has(block.id) ? (
              <span aria-hidden="true" class="world-pin" />
            ) : null}
            {ghost === undefined ? null : (
              <span class="world-ghost">
                <Glyph glyph={blockGlyph(ghost)} />
              </span>
            )}
          </div>
        </td>,
      );
    }

    rows.push(
      <tr key={row}>
        <th class="world-axis world-axis-row" scope="row">
          {row}
        </th>
        {cells}
      </tr>,
    );
  }

  return (
    <div class="world-board-frame" ref={frameRef}>
      <table
        aria-label={props.label}
        aria-readonly={props.editable ? undefined : "true"}
        class="world-grid"
        data-carrying={carry === null ? undefined : ""}
        onKeyDown={props.onKeyDown}
        ref={gridRef}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern is a table with role="grid"; the table's own markup carries the rows and headers.
        role="grid"
      >
        <thead>{head}</thead>
        <tbody>{rows}</tbody>
      </table>
      <Arrows board={gridRef} pairs={props.highlight?.pairs ?? []} />
      {dragGhost === null || dragged === undefined ? null : (
        <span
          aria-hidden="true"
          class="world-drag-ghost"
          style={{
            height: `${dragGhost.size}px`,
            left: `${dragGhost.x}px`,
            top: `${dragGhost.y}px`,
            width: `${dragGhost.size}px`,
          }}
        >
          <Glyph glyph={blockGlyph(dragged)} />
        </span>
      )}
    </div>
  );
}

/**
 * The pairs a two-place subformula is true of, as arrows from the first
 * object to the second, drawn over the board. Positions are measured from the
 * rendered cells, so the overlay follows the board at any size.
 */
function Arrows({
  board,
  pairs,
}: {
  readonly board: { readonly current: HTMLTableElement | null };
  readonly pairs: readonly (readonly [string, string])[];
}) {
  const [box, setBox] = useState<{
    readonly height: number;
    readonly centres: ReadonlyMap<
      string,
      { x: number; y: number; r: number }
    >;
    readonly width: number;
  } | null>(null);
  const key = pairs.map((pair) => pair.join(">")).join(" ");

  useLayoutEffect(() => {
    const grid = board.current;

    if (grid === null || pairs.length === 0) {
      setBox(null);
      return;
    }

    const frame = grid.getBoundingClientRect();
    const centres = new Map<string, { x: number; y: number; r: number }>();

    for (const cell of grid.querySelectorAll<HTMLElement>("[data-object]")) {
      const rect = cell.getBoundingClientRect();
      centres.set(cell.dataset.object ?? "", {
        r: rect.width / 2,
        x: rect.left - frame.left + rect.width / 2,
        y: rect.top - frame.top + rect.height / 2,
      });
    }

    setBox({ centres, height: frame.height, width: frame.width });
  }, [key, board]);

  if (box === null || pairs.length === 0) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      class="world-arrows"
      focusable="false"
      viewBox={`0 0 ${box.width} ${box.height}`}
    >
      <defs>
        <marker
          id="world-arrowhead"
          markerHeight="7"
          markerWidth="7"
          orient="auto-start-reverse"
          refX="6"
          refY="3.5"
        >
          <path class="world-arrowhead" d="M0,0 L7,3.5 L0,7 z" />
        </marker>
      </defs>
      {pairs.map(([from, to]) => {
        const a = box.centres.get(from);
        const b = box.centres.get(to);

        if (a === undefined || b === undefined) {
          return null;
        }

        if (from === to) {
          return (
            <circle
              class="world-arrow world-arrow-loop"
              cx={a.x + a.r * 0.55}
              cy={a.y - a.r * 0.55}
              key={`${from}>${to}`}
              r={a.r * 0.35}
            />
          );
        }

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        const trim = (radius: number): number => (radius * 0.55) / length;
        // A gentle bow, so a pair and its converse do not draw one line.
        const mx = (a.x + b.x) / 2 - dy * 0.12;
        const my = (a.y + b.y) / 2 + dx * 0.12;

        return (
          <path
            class="world-arrow"
            d={`M${a.x + dx * trim(a.r)},${a.y + dy * trim(a.r)} Q${mx},${my} ${b.x - dx * trim(b.r)},${b.y - dy * trim(b.r)}`}
            key={`${from}>${to}`}
            marker-end="url(#world-arrowhead)"
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The palette: shape, size, names, and the editing buttons.
// ---------------------------------------------------------------------------

const SHAPE_LABEL: Readonly<Record<BlockShape, WorldStringId>> = {
  cube: "Cube",
  dodec: "Dodec",
  tet: "Tet",
};
const SIZE_LABEL: Readonly<Record<BlockSize, WorldStringId>> = {
  large: "Large",
  medium: "Medium",
  small: "Small",
};

interface PaletteProps {
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  /** The block the palette edits, or the attributes a new block gets. */
  readonly current: { readonly shape: BlockShape; readonly size: BlockSize };
  readonly hasBlock: boolean;
  readonly locked: boolean;
  readonly onAdd: () => void;
  readonly onNames: () => void;
  readonly onRedo: () => void;
  readonly onRemove: () => void;
  readonly onShape: (shape: BlockShape) => void;
  readonly onSize: (size: BlockSize) => void;
  readonly onUndo: () => void;
  readonly words: Words;
}

/** A block of this shape and size, as the palette draws it. */
function sample(shape: BlockShape, size: BlockSize) {
  return blockGlyph({ col: 1, id: "", names: [], row: 1, shape, size });
}

/**
 * Icon-only, like the proof editors' toolbars: the glyph is the whole face,
 * the name is the `aria-label`, and the tooltip carries the key. The shapes
 * are drawn as blocks, and the sizes as the current shape at each size, so a
 * button shows what pressing it makes.
 */
function Palette(props: PaletteProps) {
  const { words, current } = props;
  const tool = (
    label: string,
    key: string,
    icon: ToolbarIconName,
    onClick: () => void,
    disabled: boolean,
  ) => (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={`${label} (${key})`}
      type="button"
    >
      <ToolbarIcon name={icon} />
    </button>
  );

  return (
    <div class="proof-toolbar world-palette">
      <fieldset class="world-palette-group">
        <legend class="visually-hidden">{words("Shape")}</legend>
        {SHAPES.map((shape) => (
          <button
            aria-label={words(SHAPE_LABEL[shape])}
            aria-pressed={current.shape === shape ? "true" : "false"}
            class="world-tool-shape"
            disabled={props.locked}
            draggable={!props.locked}
            key={shape}
            onClick={() => props.onShape(shape)}
            onDragStart={(event) => {
              event.dataTransfer?.setData("text/x-carnap-shape", shape);
              if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "copy";
              }
            }}
            title={`${words(SHAPE_LABEL[shape])} (${shape[0]})`}
            type="button"
          >
            <Glyph glyph={sample(shape, "large")} />
          </button>
        ))}
      </fieldset>
      <span aria-hidden="true" class="proof-toolbar-sep" />
      <fieldset class="world-palette-group">
        <legend class="visually-hidden">{words("Size")}</legend>
        {SIZES.map((size) => (
          <button
            aria-label={words(SIZE_LABEL[size])}
            aria-pressed={current.size === size ? "true" : "false"}
            class="world-tool-size"
            disabled={props.locked}
            key={size}
            onClick={() => props.onSize(size)}
            title={`${words(SIZE_LABEL[size])} (${size[0]})`}
            type="button"
          >
            <Glyph glyph={sample(current.shape, size)} />
          </button>
        ))}
      </fieldset>
      <span aria-hidden="true" class="proof-toolbar-sep" />
      {tool(
        words("Add block"),
        "+",
        "add-block",
        props.onAdd,
        props.hasBlock,
      )}
      {tool(
        words("Names"),
        "n",
        "name",
        props.onNames,
        !props.hasBlock || props.locked,
      )}
      {tool(
        words("Remove block"),
        "Delete",
        "remove-block",
        props.onRemove,
        !props.hasBlock || props.locked,
      )}
      <span aria-hidden="true" class="proof-toolbar-sep" />
      {tool(words("Undo"), "Ctrl-Z", "undo", props.onUndo, !props.canUndo)}
      {tool(
        words("Redo"),
        "Ctrl-Shift-Z",
        "redo",
        props.onRedo,
        !props.canRedo,
      )}
    </div>
  );
}

interface NamesProps {
  readonly available: readonly string[];
  readonly block: BlocksState["objects"][number];
  readonly onClose: () => void;
  readonly onToggle: (name: string) => void;
  readonly state: BlocksState;
  readonly words: Words;
  readonly kind: Blocks;
}

/** The names menu: one checkbox per name the language has. */
function NamesMenu(props: NamesProps) {
  const ref = useRef<HTMLFieldSetElement>(null);

  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  return (
    <fieldset
      class="world-names"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }
      }}
      ref={ref}
    >
      <legend>
        {props.words("Names for {block}", {
          block: props.kind.describeObject(
            props.state,
            props.block.id,
            props.words,
          ),
        })}
      </legend>
      {props.available.map((name) => {
        const holder = props.state.objects.find(
          (block) =>
            block.id !== props.block.id && block.names.includes(name),
        );

        return (
          <label class="world-name-option" key={name}>
            <input
              checked={props.block.names.includes(name)}
              disabled={holder !== undefined}
              onChange={() => props.onToggle(name)}
              type="checkbox"
            />
            <span class="world-name-token">{name}</span>
          </label>
        );
      })}
      <button class="world-tool" onClick={props.onClose} type="button">
        OK
      </button>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// The table: every object, as native controls.
// ---------------------------------------------------------------------------

interface TableProps {
  readonly available: readonly string[];
  readonly editable: boolean;
  readonly onAdd: () => void;
  readonly onMove: (move: BlocksMove) => void;
  readonly pinned: ReadonlySet<string>;
  readonly state: BlocksState;
  readonly words: Words;
}

function ObjectTable(props: TableProps) {
  const { words, state } = props;
  const numbers = Array.from({ length: BOARD_SIZE }, (_, index) => index + 1);

  return (
    <div class="world-table-wrap">
      <table class="world-table">
        <caption class="visually-hidden">{words("The world")}</caption>
        <thead>
          <tr>
            <th scope="col">{words("Names")}</th>
            <th scope="col">{words("Shape")}</th>
            <th scope="col">{words("Size")}</th>
            <th scope="col">{words("Column")}</th>
            <th scope="col">{words("Row")}</th>
            <th scope="col">
              <span class="visually-hidden">{words("Remove block")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {state.objects.map((block) => {
            const locked = !props.editable || props.pinned.has(block.id);
            const label = (field: WorldStringId): string =>
              `${words(field)}: ${words("Column {col}, row {row}", {
                col: String(block.col),
                row: String(block.row),
              })}`;

            return (
              <tr
                data-pinned={props.pinned.has(block.id) ? "" : undefined}
                key={block.id}
              >
                <td>
                  <input
                    aria-label={label("Names")}
                    class="world-table-names"
                    disabled={locked}
                    onChange={(event) => {
                      const names = (
                        event.currentTarget as HTMLInputElement
                      ).value
                        .split(/[\s,]+/)
                        .filter((name) => name.length > 0);
                      const unknown = names.filter(
                        (name) => !props.available.includes(name),
                      );

                      if (unknown.length > 0) {
                        (event.currentTarget as HTMLInputElement).value =
                          block.names.join(", ");
                        return;
                      }

                      props.onMove({ id: block.id, names, type: "names" });
                    }}
                    type="text"
                    value={block.names.join(", ")}
                  />
                </td>
                <td>
                  <select
                    aria-label={label("Shape")}
                    disabled={locked}
                    onChange={(event) =>
                      props.onMove({
                        id: block.id,
                        shape: (event.currentTarget as HTMLSelectElement)
                          .value as BlockShape,
                        type: "shape",
                      })
                    }
                    value={block.shape}
                  >
                    {SHAPES.map((shape) => (
                      <option key={shape} value={shape}>
                        {words(SHAPE_LABEL[shape])}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={label("Size")}
                    disabled={locked}
                    onChange={(event) =>
                      props.onMove({
                        id: block.id,
                        size: (event.currentTarget as HTMLSelectElement)
                          .value as BlockSize,
                        type: "size",
                      })
                    }
                    value={block.size}
                  >
                    {SIZES.map((size) => (
                      <option key={size} value={size}>
                        {words(SIZE_LABEL[size])}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={label("Column")}
                    disabled={locked}
                    onChange={(event) =>
                      props.onMove({
                        col: Number(
                          (event.currentTarget as HTMLSelectElement).value,
                        ),
                        id: block.id,
                        row: block.row,
                        type: "move",
                      })
                    }
                    value={String(block.col)}
                  >
                    {numbers.map((value) => (
                      <option key={value} value={String(value)}>
                        {value}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={label("Row")}
                    disabled={locked}
                    onChange={(event) =>
                      props.onMove({
                        col: block.col,
                        id: block.id,
                        row: Number(
                          (event.currentTarget as HTMLSelectElement).value,
                        ),
                        type: "move",
                      })
                    }
                    value={String(block.row)}
                  >
                    {numbers.map((value) => (
                      <option key={value} value={String(value)}>
                        {value}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    aria-label={label("Remove block")}
                    class="world-tool world-tool-remove"
                    disabled={locked}
                    onClick={() =>
                      props.onMove({ id: block.id, type: "remove" })
                    }
                    type="button"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.objects.length === 0 ? (
        <p class="world-empty">{words("No blocks yet.")}</p>
      ) : null}
      {props.editable ? (
        <button class="world-tool" onClick={props.onAdd} type="button">
          {words("Add block")}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sentence panel.
// ---------------------------------------------------------------------------

function TruthMark({
  value,
  target,
  words,
}: {
  readonly value: TruthValue;
  readonly target?: boolean;
  readonly words: Words;
}) {
  const text =
    value === null
      ? words("Cannot be evaluated in this world")
      : value
        ? words("True in this world")
        : words("False in this world");
  const met =
    target === undefined || value === null ? undefined : value === target;

  return (
    <span
      class="world-truth"
      data-met={met === undefined ? undefined : String(met)}
      data-role="truth"
      data-value={value === null ? "none" : String(value)}
      title={text}
    >
      <span aria-hidden="true">
        {value === null ? "?" : value ? "T" : "F"}
      </span>
      <span class="visually-hidden">{text}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The element.
// ---------------------------------------------------------------------------

const SHORTCUTS: readonly {
  readonly action: WorldStringId;
  readonly icon?: ToolbarIconName;
  readonly keys: readonly string[];
}[] = [
  { action: "Move between squares", keys: ["←", "→", "↑", "↓"] },
  { action: "Pick up or drop a block", keys: ["Enter", "Space"] },
  { action: "Put a carried block back", keys: ["Esc"] },
  { action: "Make it a tet, cube, or dodec", keys: ["t", "c", "d"] },
  { action: "Make it small, medium, or large", keys: ["s", "m", "l"] },
  { action: "Name it", icon: "name", keys: ["n"] },
  { action: "Add a block here", icon: "add-block", keys: ["Insert", "+"] },
  { action: "Remove it", icon: "remove-block", keys: ["Delete"] },
  { action: "Undo the last change", icon: "undo", keys: ["Ctrl-Z"] },
];

const INTRO: readonly WorldStringId[] = [
  "Drag a block to move it, or drag a shape from the palette onto a square to add one. On a touch screen, tap a block and then tap a square.",
  "The table lists every block and can do everything the board does.",
  "Point at part of a sentence to see what it is true of.",
];

let nextBlock = 0;

/** A fresh id for a block the editor adds, unlike any authored `o1…on`. */
function freshId(state: BlocksState): string {
  let id: string;

  do {
    nextBlock += 1;
    id = `n${Date.now().toString(36)}${nextBlock}`;
  } while (state.objects.some((block) => block.id === id));

  return id;
}

class CarnapWorld extends CarnapExerciseElement<WorldStringId> {
  private data: WorldPublicData | null = null;
  private resolved: ResolvedWorld | null = null;
  private kind: Blocks | null = null;
  private mount: HTMLElement | null = null;
  private helpDialog: HTMLDialogElement | null = null;

  private world: BlocksState | null = null;
  private past: BlocksState[] = [];
  private future: BlocksState[] = [];
  private marks: (boolean | null)[] = [];
  private sentence = "";

  private cursor: Cursor = { col: 1, row: 1 };
  private carry: Carry | null = null;
  private focusCursor = false;
  private tab: "board" | "table" = "board";
  private namesOpen = false;
  private newShape: BlockShape = "cube";
  private newSize: BlockSize = "small";
  private announcement = "";
  private highlight: Highlight | null = null;
  private copied = false;
  /** The author preview: the start world is editable and copyable as source. */
  private preview = false;

  private readonly words: Words = (id, values) => this.t(id, values);

  protected enhance(): void {
    const root = this.shadowRoot;
    const data = this.publicData;

    if (root === null || this.mode !== "answer" || !isWorldPublicData(data)) {
      return;
    }

    const resolved = resolveWorld(data);

    if (resolved === null || resolved.kind.id !== "blocks") {
      return;
    }

    this.data = data;
    this.resolved = resolved;
    this.kind = asBlocks(resolved.kind);
    this.preview =
      this.closest("form.exercise-submission") === null &&
      globalThis.location?.href === "about:srcdoc";
    this.restore(data, resolved);

    const body = root.querySelector<HTMLElement>("[data-role='body']");

    if (body === null) {
      return;
    }

    const style = document.createElement("style");
    style.textContent = `${TOOLBAR_STYLES}\n${islandStyles}\n${HELP_DIALOG_STYLES}`;
    root.appendChild(style);

    body.replaceChildren();
    this.mount = body;
    this.rerender();

    this.helpDialog = createHelpDialog({
      close: this.t("Close help"),
      intro: INTRO.map((id) => this.t(id)),
      keyboard: this.t("Keyboard"),
      shortcuts: SHORTCUTS.map((shortcut) => ({
        action: this.t(shortcut.action),
        keys: shortcut.keys,
        ...(shortcut.icon === undefined ? {} : { icon: shortcut.icon }),
      })),
      title: this.t("Using the world editor"),
    });
    root.appendChild(this.helpDialog);

    if (data.variant !== "distinguish" && data.variant !== "evaluate") {
      mountHelpTrigger(
        this,
        this.t("Usage and keyboard shortcuts"),
        (trigger) => {
          if (this.helpDialog !== null) {
            openHelpDialog(this.helpDialog, trigger);
          }
        },
      );
    }

    this.buildCheck();
    root.querySelector("fieldset")?.removeAttribute("aria-busy");
    this.dataset.enhanced = "true";
  }

  disconnectedCallback(): void {
    if (this.mount !== null) {
      render(null, this.mount);
    }
  }

  /** The prior answer, or the exercise's own start. */
  private restore(data: WorldPublicData, resolved: ResolvedWorld): void {
    const prior = (this.priorAnswer ?? {}) as WorldAnswerData;
    const kind = asBlocks(resolved.kind);

    this.world =
      data.variant === "distinguish"
        ? null
        : ((prior.world === undefined
            ? null
            : kind.parseState(prior.world)) ??
          (resolved.start as BlocksState));
    this.marks = data.sentences.map((_, index) => {
      const mark = prior.values?.[index];
      return typeof mark === "boolean" ? mark : null;
    });
    this.sentence = typeof prior.sentence === "string" ? prior.sentence : "";
  }

  private get editable(): boolean {
    const variant = this.data?.variant;
    return (
      variant === "build" ||
      variant === "counterexample" ||
      (this.preview && variant === "evaluate")
    );
  }

  /** Whether live truth values may be shown: full feedback, never evaluate's. */
  private get liveTruth(): boolean {
    return (
      this.feedback === "full" &&
      (this.data?.variant !== "evaluate" || this.preview)
    );
  }

  private buildCheck(): void {
    if (this.feedback === "none") {
      return;
    }

    const bar = this.querySelector<HTMLElement>(".exercise-actions");

    if (bar === null) {
      return;
    }

    const check = document.createElement("button");
    check.type = "button";
    check.className = "world-check";
    check.textContent = this.t("Check");
    check.addEventListener("click", () => this.runCheck());
    bar.insertBefore(
      check,
      bar.querySelector<HTMLElement>('button[type="submit"]'),
    );
  }

  private runCheck(): void {
    const data = this.data;
    const resolved = this.resolved;

    if (data === null || resolved === null) {
      return;
    }

    const verdict = judgeWorld(data, resolved, this.currentAnswer());

    this.setCheckStatus(
      describeWorldVerdict(verdict, resolved, this.words, this.showsDetail),
      verdict.ok,
    );
    this.setMark(verdict.ok ? "ok" : "idle");
  }

  private edited(): void {
    this.setCheckStatus("");
    this.setMark("idle");
    this.syncAnswer();
    this.rerender();
  }

  private announce(text: string): void {
    // A repeated sentence would not be re-read by a live region that sees no
    // change, so an identical announcement is nudged with a trailing space.
    this.announcement = text === this.announcement.trim() ? `${text} ` : text;
  }

  // --- Editing ------------------------------------------------------------

  /** Apply one move through the kind, the pins, and the history. */
  private readonly apply = (move: BlocksMove): boolean => {
    const kind = this.kind;
    const world = this.world;
    const resolved = this.resolved;

    if (kind === null || world === null || resolved === null) {
      return false;
    }

    const next = kind.apply(world, move);

    if (kind.isRefusal(next)) {
      this.announce(kind.describeProblem(world, next, this.words));
      this.rerender();
      return false;
    }

    if (!this.preview) {
      const broken = kind.pinViolations(
        resolved.start as BlocksState,
        next,
        resolved.pinned,
      );

      if (broken.length > 0) {
        this.announce(
          this.words("{block} is pinned and cannot be changed.", {
            block: kind.nameObject(world, broken[0] ?? "", this.words),
          }),
        );
        this.rerender();
        return false;
      }
    }

    this.announce(kind.describeMove(world, move, this.words));
    this.past = [...this.past.slice(-(HISTORY_LIMIT - 1)), world];
    this.future = [];
    this.world = next;
    this.copied = false;
    this.edited();
    return true;
  };

  private readonly undo = (): void => {
    const previous = this.past.at(-1);

    if (previous === undefined || this.world === null) {
      return;
    }

    this.future = [this.world, ...this.future];
    this.past = this.past.slice(0, -1);
    this.world = previous;
    this.carry = null;
    this.announce(this.t("Undid the last change."));
    this.edited();
  };

  private readonly redo = (): void => {
    const next = this.future[0];

    if (next === undefined || this.world === null) {
      return;
    }

    this.past = [...this.past, this.world];
    this.future = this.future.slice(1);
    this.world = next;
    this.edited();
  };

  private blockAtCursor() {
    return this.world?.objects.find(
      (block) =>
        block.col === this.cursor.col && block.row === this.cursor.row,
    );
  }

  private addAt(at: Cursor, shape: BlockShape, size: BlockSize): void {
    const world = this.world;

    if (world === null) {
      return;
    }

    this.apply({
      block: {
        col: at.col,
        id: freshId(world),
        names: [],
        row: at.row,
        shape,
        size,
      },
      type: "add",
    });
  }

  private readonly addHere = (): void => {
    this.addAt(this.cursor, this.newShape, this.newSize);
  };

  private readonly setShape = (shape: BlockShape): void => {
    const block = this.blockAtCursor();
    this.newShape = shape;

    if (block === undefined) {
      this.rerender();
      return;
    }

    this.apply({ id: block.id, shape, type: "shape" });
  };

  private readonly setSize = (size: BlockSize): void => {
    const block = this.blockAtCursor();
    this.newSize = size;

    if (block === undefined) {
      this.rerender();
      return;
    }

    this.apply({ id: block.id, size, type: "size" });
  };

  private readonly removeHere = (): void => {
    const block = this.blockAtCursor();

    if (block !== undefined) {
      this.apply({ id: block.id, type: "remove" });
    }
  };

  private readonly toggleName = (name: string): void => {
    const block = this.blockAtCursor();

    if (block === undefined) {
      return;
    }

    const names = block.names.includes(name)
      ? block.names.filter((held) => held !== name)
      : [...block.names, name];

    this.apply({ id: block.id, names, type: "names" });
  };

  /**
   * A click or tap on a square moves the cursor there, and drops a block
   * being carried. A tap also picks a block up, since a finger cannot point
   * without pressing; a mouse drags instead, so its click only selects.
   */
  private readonly onCellPointer = (
    cell: Cursor,
    pointerType: string,
  ): void => {
    const world = this.world;

    if (world === null || !this.editable) {
      this.cursor = cell;
      this.rerender();
      return;
    }

    const block = world.objects.find(
      (candidate) => candidate.col === cell.col && candidate.row === cell.row,
    );

    this.cursor = cell;
    this.focusCursor = true;
    this.namesOpen = false;

    if (this.carry !== null) {
      const carried = this.carry;
      this.carry = null;

      if (block?.id === carried.id) {
        this.rerender();
        return;
      }

      this.apply({
        col: cell.col,
        id: carried.id,
        row: cell.row,
        type: "move",
      });
      this.rerender();
      return;
    }

    if (block !== undefined && pointerType === "touch") {
      this.carry = { id: block.id };
    }

    this.rerender();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const world = this.world;
    const kind = this.kind;

    if (world === null || kind === null) {
      return;
    }

    const move = (dc: number, dr: number): void => {
      this.cursor = {
        col: Math.min(BOARD_SIZE, Math.max(1, this.cursor.col + dc)),
        row: Math.min(BOARD_SIZE, Math.max(1, this.cursor.row + dr)),
      };
      this.focusCursor = true;
      this.namesOpen = false;
    };
    const block = this.blockAtCursor();
    const ctrl = event.ctrlKey || event.metaKey;
    let handled = true;

    switch (event.key) {
      case "ArrowLeft":
        move(-1, 0);
        break;
      case "ArrowRight":
        move(1, 0);
        break;
      case "ArrowUp":
        move(0, -1);
        break;
      case "ArrowDown":
        move(0, 1);
        break;
      case "Home":
        this.cursor = { ...this.cursor, col: 1 };
        this.focusCursor = true;
        break;
      case "End":
        this.cursor = { ...this.cursor, col: BOARD_SIZE };
        this.focusCursor = true;
        break;
      case "Enter":
      case " ":
        if (!this.editable) {
          break;
        }

        if (this.carry !== null) {
          const carried = this.carry;
          this.carry = null;
          this.apply({
            col: this.cursor.col,
            id: carried.id,
            row: this.cursor.row,
            type: "move",
          });
        } else if (block !== undefined) {
          this.carry = { id: block.id };
          this.announce(
            this.t(
              "Picked up {block}. Arrow keys carry it, Enter drops it, Escape puts it back.",
              { block: kind.nameObject(world, block.id, this.words) },
            ),
          );
        }
        break;
      case "Escape":
        if (this.carry !== null) {
          const carried = world.objects.find((b) => b.id === this.carry?.id);
          this.carry = null;

          if (carried !== undefined) {
            this.cursor = { col: carried.col, row: carried.row };
            this.announce(
              this.t("Put {block} back.", {
                block: kind.nameObject(world, carried.id, this.words),
              }),
            );
          }
        } else {
          handled = false;
        }
        break;
      case "Delete":
      case "Backspace":
        if (this.editable) {
          this.removeHere();
        }
        break;
      case "Insert":
      case "+":
        if (this.editable && block === undefined) {
          this.addHere();
        }
        break;
      case "t":
      case "c":
      case "d":
        if (this.editable && !ctrl) {
          this.setShape(
            event.key === "t" ? "tet" : event.key === "c" ? "cube" : "dodec",
          );
        } else {
          handled = false;
        }
        break;
      case "s":
      case "m":
      case "l":
        if (this.editable && !ctrl) {
          this.setSize(
            event.key === "s"
              ? "small"
              : event.key === "m"
                ? "medium"
                : "large",
          );
        } else {
          handled = false;
        }
        break;
      case "n":
        if (this.editable && !ctrl && block !== undefined) {
          this.namesOpen = true;
        } else {
          handled = false;
        }
        break;
      case "?":
        if (this.helpDialog !== null) {
          openHelpDialog(this.helpDialog, event.target as HTMLElement);
        }
        break;
      case "z":
      case "Z":
        if (ctrl && this.editable) {
          if (event.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        } else {
          handled = false;
        }
        break;
      case "y":
        if (ctrl && this.editable) {
          this.redo();
        } else {
          handled = false;
        }
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      this.rerender();
    }
  };

  private readonly setHighlight = (highlight: Highlight | null): void => {
    this.highlight = highlight;

    if (highlight !== null) {
      this.announce(highlightAnnouncement(highlight, this.words));
    }

    this.rerender();
  };

  private copySource(): void {
    const world = this.world;
    const kind = this.kind;
    const resolved = this.resolved;

    if (world === null || kind === null || resolved === null) {
      return;
    }

    const lines = world.objects.map((block) => {
      const key = resolved.pinned.has(block.id)
        ? `pinned ${kind.objectKey}`
        : kind.objectKey;
      return `| ${key} : ${kind.formatObject(world, block.id)}`;
    });

    void navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        this.copied = true;
        this.announce(this.t("Copied."));
        this.rerender();
      },
      () => undefined,
    );
  }

  private currentAnswer(): WorldAnswerData {
    switch (this.data?.variant) {
      case "evaluate":
        return { values: [...this.marks] };
      case "distinguish":
        return { sentence: this.sentence };
      default:
        return this.world === null ? {} : { world: this.world };
    }
  }

  protected getAnswer(): unknown {
    return this.currentAnswer();
  }

  // --- Rendering ----------------------------------------------------------

  private rerender(): void {
    const mount = this.mount;
    const data = this.data;
    const resolved = this.resolved;
    const kind = this.kind;

    if (
      mount === null ||
      data === null ||
      resolved === null ||
      kind === null
    ) {
      return;
    }

    render(
      data.variant === "distinguish"
        ? this.distinguishView(data, resolved, kind)
        : this.worldView(data, resolved, kind),
      mount,
    );
    this.focusCursor = false;
  }

  private worldView(
    data: WorldPublicData,
    resolved: ResolvedWorld,
    kind: Blocks,
  ) {
    const world = this.world ?? (resolved.start as BlocksState);
    const words = this.words;
    const editable = this.editable;
    const physical = kind.problems(world).length === 0;
    const values =
      this.liveTruth && physical ? truthValues(resolved, world) : null;
    const block = this.blockAtCursor();
    const pinnedHere =
      !this.preview && block !== undefined && resolved.pinned.has(block.id);
    const budget =
      data.budget === undefined
        ? null
        : words("Changes: {used} of {limit}", {
            limit: String(data.budget),
            used: String(kind.distance(resolved.start as BlocksState, world)),
          });
    const pinned = this.preview ? new Set<string>() : resolved.pinned;
    const available = languageNames(resolved.language);

    return (
      <div class="world-layout" data-editable={editable ? "" : undefined}>
        <div class="world-stage">
          {editable ? (
            <div class="world-tabs" role="tablist">
              {(["board", "table"] as const).map((tab) => (
                <button
                  aria-selected={this.tab === tab ? "true" : "false"}
                  class="world-tab"
                  key={tab}
                  onClick={() => {
                    this.tab = tab;
                    this.rerender();
                  }}
                  role="tab"
                  type="button"
                >
                  {words(tab === "board" ? "Board" : "Table")}
                </button>
              ))}
            </div>
          ) : null}
          {this.tab === "board" || !editable ? (
            <div class="world-board-panel">
              {editable ? (
                <Palette
                  canRedo={this.future.length > 0}
                  canUndo={this.past.length > 0}
                  current={
                    block === undefined
                      ? { shape: this.newShape, size: this.newSize }
                      : { shape: block.shape, size: block.size }
                  }
                  hasBlock={block !== undefined}
                  locked={pinnedHere}
                  onAdd={this.addHere}
                  onNames={() => {
                    this.namesOpen = true;
                    this.rerender();
                  }}
                  onRedo={this.redo}
                  onRemove={this.removeHere}
                  onShape={this.setShape}
                  onSize={this.setSize}
                  onUndo={this.undo}
                  words={words}
                />
              ) : null}
              <Board
                carry={this.carry}
                cursor={this.cursor}
                editable={editable}
                focusCursor={this.focusCursor}
                highlight={this.highlight}
                kind={kind}
                label={words("The world")}
                onCellPointer={this.onCellPointer}
                onDragMove={(id, to) => {
                  this.carry = null;
                  this.cursor = to;
                  this.apply({ col: to.col, id, row: to.row, type: "move" });
                }}
                onKeyDown={this.onKeyDown}
                onPaletteDrop={(shape, to) => {
                  this.cursor = to;
                  this.addAt(to, shape, this.newSize);
                }}
                pinned={pinned}
                state={world}
                words={words}
              />
              {this.namesOpen && block !== undefined ? (
                <NamesMenu
                  available={available}
                  block={block}
                  kind={kind}
                  onClose={() => {
                    this.namesOpen = false;
                    this.focusCursor = true;
                    this.rerender();
                  }}
                  onToggle={this.toggleName}
                  state={world}
                  words={words}
                />
              ) : null}
            </div>
          ) : (
            <ObjectTable
              available={available}
              editable={editable}
              onAdd={() => {
                const free = this.firstFreeSquare(world);

                if (free !== null) {
                  this.addAt(free, this.newShape, this.newSize);
                }
              }}
              onMove={this.apply}
              pinned={pinned}
              state={world}
              words={words}
            />
          )}
          {budget === null ? null : <p class="world-budget">{budget}</p>}
          {this.preview && editable ? (
            <p class="world-copy">
              <button
                class="world-tool"
                onClick={() => this.copySource()}
                type="button"
              >
                {words("Copy as source")}
              </button>
              {this.copied ? (
                <span class="world-copied">{words("Copied.")}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div class="world-panel">
          {this.sentencePanel(data, resolved, values)}
        </div>
        <p aria-live="polite" class="visually-hidden">
          {this.announcement}
        </p>
      </div>
    );
  }

  private sentencePanel(
    data: WorldPublicData,
    resolved: ResolvedWorld,
    values: ReturnType<typeof truthValues> | null,
  ) {
    const words = this.words;
    const evaluate = data.variant === "evaluate";
    const world = this.world ?? (resolved.start as BlocksState);
    const highlighting =
      this.feedback === "full" && (!evaluate || this.preview);

    return (
      <>
        <h3 class="world-panel-heading">{words("Sentences")}</h3>
        <ol class="world-sentences">
          {resolved.sentences.map((sentence, index) => {
            const target =
              sentence.target === undefined
                ? null
                : data.variant === "counterexample"
                  ? sentence.target
                    ? words("Premise")
                    : words("Conclusion")
                  : sentence.target
                    ? words("Make true")
                    : words("Make false");
            const mark = this.marks[index] ?? null;

            return (
              <li
                class="world-sentence"
                data-index={index}
                data-target={
                  sentence.target === undefined
                    ? undefined
                    : String(sentence.target)
                }
                key={sentence.text}
              >
                {target === null ? null : (
                  <span class="world-target">{target}</span>
                )}
                <FormulaView
                  enabled={highlighting && values !== null}
                  kind={resolved.kind}
                  onHighlight={this.setHighlight}
                  resolved={resolved}
                  state={world}
                  text={sentence.text}
                  words={words}
                />
                {evaluate && !this.preview ? (
                  <fieldset class="world-marks">
                    <legend class="visually-hidden">
                      {words("{sentence}: your mark", {
                        sentence: sentence.text,
                      })}
                    </legend>
                    {[true, false].map((value) => (
                      <button
                        aria-pressed={mark === value ? "true" : "false"}
                        class="world-mark"
                        key={String(value)}
                        onClick={() => {
                          this.marks[index] = mark === value ? null : value;
                          this.edited();
                        }}
                        type="button"
                      >
                        {words(value ? "True" : "False")}
                      </button>
                    ))}
                  </fieldset>
                ) : values === null ? (
                  <span class="world-truth" data-role="truth" />
                ) : (
                  <TruthMark
                    {...(sentence.target === undefined
                      ? {}
                      : { target: sentence.target })}
                    value={values.sentences[index] ?? null}
                    words={words}
                  />
                )}
              </li>
            );
          })}
        </ol>
        {resolved.laws.length === 0 ? null : (
          <>
            <h3 class="world-panel-heading">{words("Laws")}</h3>
            <ul class="world-laws">
              {resolved.laws.map((law, index) => (
                <li class="world-sentence world-law" key={law.text}>
                  <FormulaView
                    enabled={highlighting && values !== null}
                    kind={resolved.kind}
                    onHighlight={this.setHighlight}
                    resolved={resolved}
                    state={world}
                    text={law.text}
                    words={words}
                  />
                  {values === null ? (
                    <span class="world-truth" data-role="truth" />
                  ) : (
                    <TruthMark
                      target
                      value={values.laws[index] ?? null}
                      words={words}
                    />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  private distinguishView(
    data: WorldPublicData,
    resolved: ResolvedWorld,
    kind: Blocks,
  ) {
    const words = this.words;
    const worlds = resolved.worlds;
    const verdict =
      this.feedback === "full" && this.sentence.trim() !== ""
        ? judgeDistinguish(data, resolved, this.sentence)
        : null;
    const figure = (
      state: BlocksState,
      label: string,
      value: TruthValue | undefined,
    ) => (
      <figure class="world-figure">
        <figcaption class="world-figure-label">
          <span>{label}</span>
          {value === undefined ? null : (
            <TruthMark value={value} words={words} />
          )}
        </figcaption>
        <Board
          carry={null}
          cursor={{ col: 0, row: 0 }}
          editable={false}
          focusCursor={false}
          highlight={null}
          kind={kind}
          label={label}
          onCellPointer={() => undefined}
          onDragMove={() => undefined}
          onKeyDown={() => undefined}
          onPaletteDrop={() => undefined}
          pinned={new Set()}
          state={state}
          words={words}
        />
        <ul class="world-object-list">
          {state.objects.map((block) => (
            <li class="world-object" key={block.id}>
              {kind.describeObject(state, block.id, words)}
            </li>
          ))}
        </ul>
      </figure>
    );
    const shown = (value: TruthValue): TruthValue | undefined =>
      verdict === null || verdict.errors.length > 0 ? undefined : value;
    const restriction = data.restriction;
    const errorText =
      verdict !== null && !verdict.ok && verdict.inA === null
        ? describeWorldVerdict(verdict, resolved, words)
        : "";

    return (
      <div class="world-layout world-layout-pair">
        <div class="world-pair">
          {worlds === null
            ? null
            : [
                figure(
                  worlds.a as BlocksState,
                  words("World A"),
                  shown(verdict?.inA ?? null),
                ),
                figure(
                  worlds.b as BlocksState,
                  words("World B"),
                  shown(verdict?.inB ?? null),
                ),
              ]}
        </div>
        <div class="world-panel">
          <label class="world-answer-label" for="world-sentence">
            {words("Your sentence")}
          </label>
          <input
            autocomplete="off"
            class="world-answer"
            id="world-sentence"
            onInput={(event) => {
              this.sentence = (event.currentTarget as HTMLInputElement).value;
              this.edited();
            }}
            spellcheck={false}
            type="text"
            value={this.sentence}
          />
          {errorText === "" ? null : (
            <p class="world-answer-note" role="status">
              {errorText}
            </p>
          )}
          {restriction?.symbols !== undefined ? (
            <p class="world-restriction">
              {words("Allowed symbols: {symbols}", {
                symbols: restriction.symbols.join(" "),
              })}
            </p>
          ) : restriction?.without !== undefined ? (
            <p class="world-restriction">
              {words("Not allowed: {symbols}", {
                symbols: restriction.without.join(" "),
              })}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  private firstFreeSquare(world: BlocksState): Cursor | null {
    for (let row = 1; row <= BOARD_SIZE; row += 1) {
      for (let col = 1; col <= BOARD_SIZE; col += 1) {
        if (
          !world.objects.some(
            (block) => block.col === col && block.row === row,
          )
        ) {
          return { col, row };
        }
      }
    }

    return null;
  }
}

register("carnap-world", CarnapWorld);
