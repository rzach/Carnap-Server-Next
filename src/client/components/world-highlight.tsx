/** @jsxImportSource preact */
/**
 * Subformula highlighting for the world editor: point at part of a sentence,
 * or walk its syntax tree with the keyboard, and the board shows what that
 * part is true of.
 *
 * The displayed text is canonical, and canonical text is valid input, so it
 * is re-parsed here with its spans kept (`parseFormulaTree`); each subformula
 * is a span of the text. What it shows depends on how many variables the
 * subformula has free:
 *
 *   - none: its truth value, and for a quantifier its witnesses (a true `∃`)
 *     or counterexamples (a false `∀`), ringed on the board;
 *   - one: the objects that satisfy it, ringed;
 *   - two: arrows between the pairs that satisfy it;
 *   - more: the satisfying tuples, as a list.
 *
 * A sentence in words is always announced as well, so none of this depends on
 * seeing the board.
 */

import { useMemo, useState } from "preact/hooks";
import type { FormulaNode } from "../../worker/exercise-kit/formula";
import {
  freeVariables,
  parseFormulaTree,
  satisfiers,
  satisfies,
} from "../../worker/exercise-kit/formula";
import type { ResolvedWorld } from "../../worker/exercises/world/grading";
import type {
  WorldKind,
  WorldWords,
} from "../../worker/exercises/world/kinds/contract";
import {
  formulaNames,
  worldNames,
  worldStructure,
} from "../../worker/exercises/world/logic/structure";

export type RingKind = "satisfies" | "witness" | "counterexample";

export interface Highlight {
  /** The subformula's text, as displayed. */
  readonly text: string;
  readonly mode:
    | "truth"
    | "objects"
    | "pairs"
    | "tuples"
    | "witnesses"
    | "counterexamples";
  readonly value?: boolean;
  readonly rings: ReadonlyMap<string, RingKind>;
  readonly pairs: readonly (readonly [string, string])[];
  /** Each satisfying tuple (or ringed object) in words. */
  readonly described: readonly string[];
}

function describeObjects(
  kind: WorldKind,
  state: unknown,
  ids: readonly string[],
  words: WorldWords,
): string {
  return ids.map((id) => kind.nameObject(state, id, words)).join(", ");
}

/** What one subformula says about a world. */
export function computeHighlight(
  node: FormulaNode,
  text: string,
  resolved: ResolvedWorld,
  state: unknown,
  words: WorldWords,
): Highlight | null {
  const { kind } = resolved;
  const named = worldNames(kind, state);

  if (!formulaNames(node.formula).every((name) => named.has(name))) {
    return null;
  }

  const { structure, ids } = worldStructure(kind, state, resolved.vocabulary);
  const free = freeVariables(node.formula);
  const empty = {
    described: [] as string[],
    pairs: [] as (readonly [string, string])[],
    rings: new Map<string, RingKind>(),
  };
  const idOf = (element: number): string => ids[element] ?? "";

  if (free.length === 0) {
    const value = satisfies(node.formula, structure);
    const formula = node.formula;

    if (formula.type === "exists" && value) {
      const found = satisfiers(formula.body, structure, [
        formula.variable,
      ]).map(([element]) => idOf(element ?? 0));

      return {
        ...empty,
        described: found.map((id) =>
          describeObjects(kind, state, [id], words),
        ),
        mode: "witnesses",
        rings: new Map(found.map((id) => [id, "witness" as const])),
        text,
        value,
      };
    }

    if (formula.type === "forall" && !value) {
      const holding = new Set(
        satisfiers(formula.body, structure, [formula.variable]).map(
          ([element]) => element,
        ),
      );
      const found = structure.domain
        .filter((element) => !holding.has(element))
        .map(idOf);

      return {
        ...empty,
        described: found.map((id) =>
          describeObjects(kind, state, [id], words),
        ),
        mode: "counterexamples",
        rings: new Map(found.map((id) => [id, "counterexample" as const])),
        text,
        value,
      };
    }

    return { ...empty, mode: "truth", text, value };
  }

  const tuples = satisfiers(node.formula, structure, free).map((tuple) =>
    tuple.map(idOf),
  );

  if (free.length === 1) {
    const found = tuples.map(([id]) => id ?? "");

    return {
      ...empty,
      described: found.map((id) => describeObjects(kind, state, [id], words)),
      mode: "objects",
      rings: new Map(found.map((id) => [id, "satisfies" as const])),
      text,
    };
  }

  const described = tuples.map(
    (tuple) => `(${describeObjects(kind, state, tuple, words)})`,
  );

  if (free.length === 2) {
    return {
      ...empty,
      described,
      mode: "pairs",
      pairs: tuples.map(([a, b]) => [a ?? "", b ?? ""] as const),
      text,
    };
  }

  return { ...empty, described, mode: "tuples", text };
}

/** The highlight in words, for the live region. */
export function highlightAnnouncement(
  highlight: Highlight,
  words: WorldWords,
): string {
  const objects = highlight.described.join("; ");

  switch (highlight.mode) {
    case "truth":
      return highlight.value
        ? words("{formula}: true.", { formula: highlight.text })
        : words("{formula}: false.", { formula: highlight.text });
    case "witnesses":
      return words("{formula}: witnesses {objects}.", {
        formula: highlight.text,
        objects,
      });
    case "counterexamples":
      return words("{formula}: counterexamples {objects}.", {
        formula: highlight.text,
        objects,
      });
    default:
      return highlight.described.length === 0
        ? words("{formula}: satisfied by nothing.", {
            formula: highlight.text,
          })
        : words("{formula}: satisfied by {objects}.", {
            formula: highlight.text,
            objects,
          });
  }
}

/** The node a path of child indices leads to. */
function nodeAt(
  root: FormulaNode,
  path: readonly number[],
): FormulaNode | undefined {
  let node: FormulaNode | undefined = root;

  for (const index of path) {
    node = node?.children[index];
  }

  return node;
}

interface FormulaViewProps {
  readonly enabled: boolean;
  readonly kind: WorldKind;
  readonly onHighlight: (highlight: Highlight | null) => void;
  readonly resolved: ResolvedWorld;
  readonly state: unknown;
  readonly text: string;
  readonly words: WorldWords;
}

/**
 * A sentence, with each of its subformulas a span a pointer can rest on and
 * the keyboard can walk: Up to the enclosing formula, Down into the first
 * part, Left and Right among the parts.
 */
export function FormulaView(props: FormulaViewProps) {
  const { text, resolved } = props;
  const tree = useMemo(
    () => parseFormulaTree(text, resolved.language),
    [text, resolved.language],
  );
  const [active, setActive] = useState<readonly number[] | null>(null);

  if (!props.enabled || tree === null) {
    return <span class="world-formula">{text}</span>;
  }

  const show = (path: readonly number[] | null): void => {
    setActive(path);

    const node = path === null ? undefined : nodeAt(tree, path);

    props.onHighlight(
      node === undefined
        ? null
        : computeHighlight(
            node,
            text.slice(node.start, node.end),
            resolved,
            props.state,
            props.words,
          ),
    );
  };

  const draw = (node: FormulaNode, path: readonly number[]) => {
    const parts = [];
    let at = node.start;

    for (const [index, child] of node.children.entries()) {
      if (child.start > at) {
        parts.push(text.slice(at, child.start));
      }

      parts.push(draw(child, [...path, index]));
      at = child.end;
    }

    if (at < node.end) {
      parts.push(text.slice(at, node.end));
    }

    const isActive =
      active !== null &&
      active.length === path.length &&
      active.every((step, index) => step === path[index]);

    return (
      <span
        class="world-sub"
        data-active={isActive ? "" : undefined}
        key={path.join(".")}
        onPointerOver={(event) => {
          event.stopPropagation();
          show(path);
        }}
      >
        {parts}
      </span>
    );
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const path = active ?? [];
    const node = nodeAt(tree, path);
    const parentPath = path.slice(0, -1);
    const parent = nodeAt(tree, parentPath);
    const last = path.at(-1);
    let next: readonly number[] | null | undefined;

    switch (event.key) {
      case "ArrowUp":
        next = path.length === 0 ? path : parentPath;
        break;
      case "ArrowDown":
        next =
          node !== undefined && node.children.length > 0
            ? [...path, 0]
            : path;
        break;
      case "ArrowLeft":
        next =
          last !== undefined && last > 0 ? [...parentPath, last - 1] : path;
        break;
      case "ArrowRight":
        next =
          last !== undefined &&
          parent !== undefined &&
          last < parent.children.length - 1
            ? [...parentPath, last + 1]
            : path;
        break;
      case "Escape":
        next = null;
        break;
      default:
        return;
    }

    event.preventDefault();
    show(next);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a sentence the keyboard walks part by part has no ARIA role that fits; its parts are announced through the editor's live region.
    <span
      class="world-formula"
      data-interactive=""
      onBlur={() => show(null)}
      onFocus={() => show(active ?? [])}
      onKeyDown={onKeyDown}
      onPointerLeave={() => show(null)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the sentence is a tree the keyboard walks, and needs a tab stop of its own.
      tabIndex={0}
    >
      {draw(tree, [])}
    </span>
  );
}
