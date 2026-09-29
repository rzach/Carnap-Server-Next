/**
 * What a world kind is: the plugin contract the world exercise is written
 * against, so that a new kind of picture — a graph, a map — is a folder
 * beside `blocks/` and one line in `./index.ts`, not a change to the type.
 *
 * A kind is not an exercise type. A type may import only the kit, and the
 * kinds share the world type's machinery (its answer shape, its checks, its
 * editor), so they live inside it.
 *
 * Everything here is DOM-free and free of any i18n import: the browser's
 * editor and the worker's grader run the same kind. The words a kind has for
 * its objects and moves arrive as a {@link WorldWords} lookup, which is a
 * translator on the server and the hydration strings in the browser.
 */

import type { WorldStringId } from "../strings";

/**
 * A lookup with an English fallback — the widget's `t()` in the browser, the
 * strings map on the server.
 */
export type WorldWords = (
  id: WorldStringId,
  values?: Readonly<Record<string, string>>,
) => string;

/**
 * Something wrong with a world or an edit, as data: a stable `code` the words
 * are chosen by, the objects it is about, and any values the sentence needs.
 * Used for the physics a world breaks ({@link WorldKind.problems}) and for a
 * move the editor refuses ({@link WorldKind.apply}), because they are the same
 * complaints seen from two sides: a state with two blocks on one square is a
 * problem, and the move that would make one is refused for that reason.
 */
/** A sentence the editor says about one object: see {@link WorldKind.objectSentence}. */
export type ObjectSentence =
  | "pinned"
  | "picked-up"
  | "put-back"
  /** The evaluation game's choice of an object for `{variable}`. */
  | "game-student-choice"
  | "game-computer-choice";

export interface WorldProblem {
  readonly code: string;
  readonly objects: readonly string[];
  readonly values?: Readonly<Record<string, string>>;
}

/** What one role in a kind's namespace means over its states. */
export type WorldSymbol<State> =
  | {
      readonly kind: "relation";
      readonly arity: number;
      holds(state: State, ids: readonly string[]): boolean;
    }
  | {
      readonly kind: "function";
      readonly arity: number;
      value(state: State, ids: readonly string[]): string;
    };

/** An object as the rest of the type sees it: an identity and its names. */
export interface WorldObject {
  readonly id: string;
  readonly names: readonly string[];
}

/**
 * A drawing primitive in a piece's own 100 × 100 box. A server serializer
 * writes these as SVG for the read-only view, and the editor renders the very
 * same list, so the two drawings cannot drift apart.
 */
export type DrawPrimitive =
  | {
      readonly el: "polygon";
      readonly points: string;
      readonly className: string;
    }
  | {
      readonly el: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly className: string;
    }
  | {
      readonly el: "circle";
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly className: string;
    }
  | {
      readonly el: "text";
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly className: string;
    };

/**
 * A world, drawn. One shape today, a board of squares; the union is where a
 * kind whose objects float on a canvas (a graph's vertices) would add its
 * own, with the editor choosing its board component by it.
 */
export interface GridDrawing {
  readonly layout: "grid";
  readonly columns: number;
  readonly rows: number;
  readonly pieces: readonly {
    readonly id: string;
    readonly col: number;
    readonly row: number;
    readonly glyph: readonly DrawPrimitive[];
  }[];
}

export type WorldDrawing = GridDrawing;

/**
 * A world kind: its states, what its vocabulary means over them, how they are
 * edited, and how they are described.
 *
 * `State` is the kind's own JSON shape, tagged with its id and version
 * (`blocks@1`); `Spec` is one authored object line read, before it is given an
 * id; `Move` is one edit. Methods rather than function properties, so that a
 * kind over its own types is assignable to the registry's `WorldKind`.
 */
export interface WorldKind<State = unknown, Move = unknown, Spec = unknown> {
  /** `blocks`: what an author writes in `world=`. */
  readonly id: string;
  /** The state tag's version; a bump is a new contract, not a reinterpretation. */
  readonly version: number;
  /** The `@syntax role` namespace the kind interprets: `blocks` for `blocks.cube`. */
  readonly roleNamespace: string;
  /** Role → what it means. Roles in the namespace missing here are typos. */
  readonly vocabulary: ReadonlyMap<string, WorldSymbol<State>>;
  readonly maxObjects: number;
  /** The key of an object line in the body: `block` for `| block : …`. */
  readonly objectKey: string;

  /** An empty world, for a variant that starts from nothing. */
  empty(): State;
  /** One authored object line's value, or why it does not read. */
  parseObject(text: string): Spec | WorldProblem;
  /** The line an author would write for an object: the preview's "copy as source". */
  formatObject(state: State, id: string): string;
  /** A world from its authored objects, given ids `o1…on` in order. */
  build(specs: readonly Spec[]): State;

  /** Untrusted JSON as a state, by shape alone; `null` if it is not one. */
  parseState(json: unknown): State | null;
  /** Everything physically wrong with a state. Empty for a legal world. */
  problems(state: State): readonly WorldProblem[];
  /** The domain, in a fixed order. */
  objects(state: State): readonly WorldObject[];

  /** One edit, or why not. The editor is a reducer over these. */
  apply(state: State, move: Move): State | WorldProblem;
  /** Untrusted JSON as a move; reserved for a recorded move log. */
  parseMove(json: unknown): Move | null;
  /** Whether a value {@link apply} returned is a refusal. */
  isRefusal(value: State | WorldProblem): value is WorldProblem;

  /** How many changes separate two states: what a budget counts. */
  distance(from: State, to: State): number;
  /** The pinned objects `to` has changed or lost relative to `from`. */
  pinViolations(
    from: State,
    to: State,
    pinned: ReadonlySet<string>,
  ): readonly string[];

  /** A state as a picture. */
  draw(state: State): WorldDrawing;

  /** An object in full: what it is, where, and its names. */
  describeObject(state: State, id: string, words: WorldWords): string;
  /**
   * How a sentence refers to an object in passing: by its names where it has
   * any, since those are what the sentences use, and otherwise briefly.
   */
  nameObject(state: State, id: string, words: WorldWords): string;
  /**
   * One of the editor's sentences about an object, worded whole. An object
   * with no name is referred to by where it is, and a translation needs the
   * whole sentence to put that phrase where its grammar goes — first, and
   * capitalized, in some languages but not others.
   */
  objectSentence(
    state: State,
    id: string,
    sentence: ObjectSentence,
    words: WorldWords,
    values?: Readonly<Record<string, string>>,
  ): string;
  describeMove(before: State, move: Move, words: WorldWords): string;
  describeProblem(
    state: State,
    problem: WorldProblem,
    words: WorldWords,
  ): string;
}
