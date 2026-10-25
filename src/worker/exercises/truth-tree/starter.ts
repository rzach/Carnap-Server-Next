/**
 * A tree as an author writes it under the root (#475): the starter, the body
 * after the directive's `----`. It has the proof tree's line form (see
 * `exercise-kit/proof/tree-parse.ts`), one row a line, with the tree's shape
 * given by indentation:
 *
 * ```text
 * 4: $ ¬D $ by ¬∨ [3]
 * 5: $ ¬R $
 * - 6: $ D & ¬R $ by ∨ [1]
 *   7: $ D $ by & [6]
 *   8: $ ¬R $
 *   closed [4, 7]
 * - 6: $ Q $
 *   open
 * ```
 *
 * A row is `label: $ text $`, the label optional, and `by rule [cites]` after
 * it begins a step: the rule as the margin names it and the rows it develops,
 * by label. A row without `by` continues the step above it, as a row under
 * another of its step does in the editor. A `- ` item opens a branch, and the
 * items at one indentation are the branches of one split, whose step is named
 * on its first branch. A branch ends with `closed [cites]` or `open`. The
 * root's rows are labelled by their place, `1` to `n`, and a label names the
 * row above it on its own branch, so two branches may each have a `6`.
 *
 * `$` is the delimiter because no row can hold one, whatever the theory: a
 * signed row is typed `T: A`, so a colon could not be.
 *
 * DOM-free: the compiler reads a starter with it, and the editor writes one
 * for Copy as source and Ctrl-?, so what one writes the other reads.
 */

import type { DiagnosticMessageId } from "../../application/content/diagnostic-strings";
import type { TranslatableMessage } from "../../i18n/translator";
import type {
  TableauDocument,
  TableauEnd,
  TableauNode,
  TableauRow,
} from "./tableau/document";
import { TableauIndex } from "./tableau/document";
import { layoutTableau } from "./tableau/layout";

/**
 * The tree a starter seeds, below the root. Its root node (`root`) holds the
 * rows that follow the root's own, which the exercise adds in front, and a
 * citation of the root's n-th row names `root-n`.
 */
export interface TruthTreeStarter {
  readonly nodes: readonly TableauNode[];
  /** The rule each step names, by its `dev`. */
  readonly rules: Readonly<Record<string, string>>;
}

/** The id of the root's `n`-th row, counted from 1. */
export function rootRowId(n: number): string {
  return `root-${n}`;
}

/** One problem with a starter, as the compiler will report it. */
export interface StarterIssue extends TranslatableMessage {
  readonly code: string;
  readonly message: DiagnosticMessageId;
  /** 0-based offset of the line within the starter. */
  readonly line: number;
}

export type StarterParse =
  | {
      readonly ok: true;
      readonly starter: TruthTreeStarter;
      /** The line that wrote each row, for the compiler's warnings. */
      readonly rowLines: ReadonlyMap<string, number>;
      /** The line that named each step's rule. */
      readonly ruleLines: ReadonlyMap<string, number>;
    }
  | { readonly ok: false; readonly issue: StarterIssue };

/**
 * `label: $ text $ by rule [cites]`, every part but the text optional: the
 * label, the text, the `by` clause, its rule, its cites.
 */
const ROW_LINE =
  /^(?:([A-Za-z0-9_]+)\s*:\s*)?\$([^$]*)\$(\s+by(?:\s+([^\s[\]]+))?\s*(?:\[([^\]]*)\])?)?\s*$/;
/** `closed [cites]` or `open`. */
const END_LINE = /^(?:closed(?:\s*\[([^\]]*)\])?|(open))\s*$/;
/** A branch's opening item: `- ` and what follows on its line. */
const BRANCH = /^-\s+/;

interface Line {
  readonly at: number;
  /** The column the line's content starts at, a tab counted as four. */
  readonly column: number;
  /** Whether the line opens a branch with `- `. */
  readonly branch: boolean;
  /** The line after its indentation and any `- `. */
  readonly content: string;
  /** The column the content starts at, past any `- `. */
  readonly contentColumn: number;
}

function width(indent: string): number {
  let columns = 0;

  for (const character of indent) {
    columns += character === "\t" ? 4 : 1;
  }

  return columns;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];

  for (const [at, raw] of text.split("\n").entries()) {
    const trimmed = raw.trim();

    // Blank lines and `--` comments, as the proof tree's starter allows.
    if (trimmed.length === 0 || trimmed.startsWith("--")) {
      continue;
    }

    const rest = raw.trimStart();
    const column = width(raw.slice(0, raw.length - rest.length));
    const item = BRANCH.exec(rest);

    lines.push({
      at,
      branch: item !== null,
      column,
      content: item === null ? trimmed : rest.slice(item[0].length).trim(),
      contentColumn: item === null ? column : column + width(item[0]),
    });
  }

  return lines;
}

function labelsIn(text: string | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

class StarterError extends Error {
  constructor(readonly issue: StarterIssue) {
    super(issue.message);
  }
}

function fail(
  line: number,
  code: string,
  message: DiagnosticMessageId,
  params?: TranslatableMessage["params"],
): never {
  throw new StarterError({
    code,
    line,
    message,
    ...(params === undefined ? {} : { params }),
  });
}

/** A step: its development, and the rows it develops. */
interface Step {
  readonly dev: string;
  readonly cites: readonly string[];
}

const UNJUSTIFIED: DiagnosticMessageId =
  "This row begins a step, so it needs “by”, with the step's rule and the rows it develops.";
const MISALIGNED: DiagnosticMessageId =
  "This line is not in line with the branch it is in: a branch's lines line up with its first.";

/**
 * Read a starter, for a root of `rootRows` rows. Its first structural problem
 * is an error: a citation of a row that is not above it, or a row out of its
 * place, cannot be put in a tree. Whether its rows read, and its rules are
 * the theory's, is the compiler's to say, as warnings.
 */
export function parseTreeStarter(
  text: string,
  rootRows: number,
): StarterParse {
  const lines = linesOf(text);
  const nodes: TableauNode[] = [];
  const rules: Record<string, string> = {};
  const rowLines = new Map<string, number>();
  const ruleLines = new Map<string, number>();
  let rows = 0;
  let branches = 0;
  let devs = 0;
  let next = 0;

  const resolve = (
    labels: readonly string[],
    visible: ReadonlyMap<string, string>,
    at: number,
  ): string[] =>
    labels.map((label) => {
      const id = visible.get(label);

      if (id === undefined) {
        fail(
          at,
          "truth_tree_starter_citation",
          "“{label}” names no row above this one on its branch.",
          { label },
        );
      }

      return id;
    });

  /**
   * One row, into `out`: a step of its own if it says `by`, else the next row
   * of `continues`, the step above it or, on a split's later branch, the
   * split's.
   */
  const row = (
    line: Line,
    out: TableauRow[],
    labels: Map<string, string>,
    continues: Step | null,
    laterBranch: boolean,
  ): TableauRow => {
    const match = ROW_LINE.exec(line.content);

    if (match === null) {
      fail(
        line.at,
        "truth_tree_starter_line",
        "Could not read “{line}”. A starter row reads “label: $ row $ by rule [cites]”, a branch ends “closed [cites]” or “open”, and “- ” opens a branch.",
        { line: line.content },
      );
    }

    const [, label, text = "", by, rule, cites] = match;
    let step: Step;

    if (by === undefined) {
      if (continues === null) {
        fail(line.at, "truth_tree_starter_unjustified", UNJUSTIFIED);
      }

      step = continues;
    } else {
      if (laterBranch) {
        fail(
          line.at,
          "truth_tree_starter_split_step",
          "A split's step is named once, on its first branch.",
        );
      }

      devs += 1;
      step = {
        cites: resolve(labelsIn(cites), labels, line.at),
        dev: `d${devs}`,
      };

      if (rule !== undefined) {
        rules[step.dev] = rule;
        ruleLines.set(step.dev, line.at);
      }
    }

    rows += 1;
    const made: TableauRow = {
      cites: [...step.cites],
      dev: step.dev,
      id: `s${rows}`,
      text: text.trim(),
    };

    if (label !== undefined) {
      if (labels.has(label)) {
        fail(
          line.at,
          "truth_tree_starter_label",
          "The label “{label}” is used twice on one branch.",
          { label },
        );
      }

      labels.set(label, made.id);
    }

    out.push(made);
    rowLines.set(made.id, line.at);
    return made;
  };

  /**
   * A branch's lines from `next` on, at `column`, into `out`: rows, then its
   * end or a split. `above` is the step the next row continues.
   */
  const body = (
    column: number,
    nodeId: string,
    out: TableauRow[],
    labels: Map<string, string>,
    above: Step | null,
  ): TableauEnd | undefined => {
    let continues = above;

    while (next < lines.length) {
      const line = lines[next] as Line;

      if (line.column < column) {
        return undefined;
      }

      if (line.column > column) {
        fail(line.at, "truth_tree_starter_indent", MISALIGNED);
      }

      if (line.branch) {
        split(column, nodeId, labels);
        const after = lines[next];

        // A split is the last thing on its branch.
        if (after !== undefined && after.column === column) {
          fail(
            after.at,
            "truth_tree_starter_after_split",
            "Nothing can follow a split on its branch. Put it in the split's branches.",
          );
        }

        return undefined;
      }

      next += 1;
      const end = END_LINE.exec(line.content);

      if (end === null) {
        const made = row(line, out, labels, continues, false);
        continues = { cites: made.cites, dev: made.dev };
        continue;
      }

      const following = lines[next];

      if (following !== undefined && following.column >= column) {
        fail(
          following.at,
          "truth_tree_starter_after_end",
          "Nothing can follow the end of a branch.",
        );
      }

      return end[2] === undefined
        ? {
            cites: resolve(labelsIn(end[1]), labels, line.at),
            type: "closed",
          }
        : { type: "open" };
    }

    return undefined;
  };

  /** The branches of a split below `parent`, each a `- ` item at `column`. */
  const split = (
    column: number,
    parent: string,
    labels: ReadonlyMap<string, string>,
  ): void => {
    let step: Step | null = null;

    while (next < lines.length) {
      const line = lines[next] as Line;

      if (line.column !== column || !line.branch) {
        return;
      }

      if (END_LINE.test(line.content)) {
        fail(
          line.at,
          "truth_tree_starter_empty_branch",
          "A branch begins with a row.",
        );
      }

      branches += 1;
      const own: TableauRow[] = [];
      const visible = new Map(labels);
      const node: TableauNode & { end?: TableauEnd } = {
        id: `n${branches}`,
        parent,
        rows: own,
      };

      // Before its own branches, so parents come first.
      nodes.push(node);
      next += 1;

      const first = row(line, own, visible, step, step !== null);
      step ??= { cites: first.cites, dev: first.dev };

      const end = body(line.contentColumn, node.id, own, visible, {
        cites: first.cites,
        dev: first.dev,
      });

      if (end !== undefined) {
        node.end = end;
      }
    }
  };

  try {
    if (lines.length > 0 && rootRows === 0) {
      fail(
        lines[0]?.at ?? 0,
        "truth_tree_starter_without_root",
        "A starter grows from a root: write the root's rows above the “----”.",
      );
    }

    const rootNode: TableauNode & { end?: TableauEnd } = {
      id: "root",
      parent: null,
      rows: [],
    };
    nodes.push(rootNode);

    // The root's rows are labelled by their place. The row after the root's
    // last begins a step: no step continues the root.
    const labels = new Map(
      Array.from({ length: rootRows }, (_, at) => [
        String(at + 1),
        rootRowId(at + 1),
      ]),
    );
    const end = body(
      lines[0]?.column ?? 0,
      rootNode.id,
      rootNode.rows as TableauRow[],
      labels,
      null,
    );

    if (end !== undefined) {
      rootNode.end = end;
    }

    const stray = lines[next];

    if (stray !== undefined) {
      fail(stray.at, "truth_tree_starter_indent", MISALIGNED);
    }
  } catch (error) {
    if (error instanceof StarterError) {
      return { issue: error.issue, ok: false };
    }

    throw error;
  }

  return { ok: true, ruleLines, rowLines, starter: { nodes, rules } };
}

/**
 * A tree as an author writes it: the root as the directive's list, then, if
 * the tree has more, `----` and the starter. The inverse of the directive's
 * body, up to ids: each row is labelled with its line in the tree's layout,
 * as the editor numbers it, and cites by those numbers. Rows and rules are
 * as typed.
 *
 * `rootRows` is how many of the root node's first rows are the root.
 */
export function treeStarterSource(
  tree: TableauDocument,
  rules: ReadonlyMap<string, string>,
  rootRows: number,
): string {
  const index = new TableauIndex(tree);
  const layout = layoutTableau(tree, rules);
  const label = (rowId: string): string =>
    String(layout.rows.get(rowId)?.line ?? "?");
  const rootNode = index.root;

  if (rootNode === null) {
    return "";
  }

  const out = rootNode.rows.slice(0, rootRows).map((row) => `- ${row.text}`);
  const below: string[] = [];
  const cites = (ids: readonly string[]): string => ids.map(label).join(", ");
  const step = (row: TableauRow): string => {
    const rule = rules.get(row.dev)?.trim() ?? "";

    return ` by${rule === "" ? "" : ` ${rule}`} [${cites(row.cites)}]`;
  };
  const rowLine = (row: TableauRow, steps: boolean): string =>
    `${label(row.id)}: $ ${row.text} $${steps ? step(row) : ""}`;

  /**
   * A node's rows from `from` on, then its end or its branches. `first` is a
   * branch's own first line, written after its `- ` by the caller.
   */
  const write = (node: TableauNode, from: number, indent: string): void => {
    for (let at = from; at < node.rows.length; at += 1) {
      const row = node.rows[at] as TableauRow;
      const previous = node.rows[at - 1];
      // A step begins where the previous row is of another, or is the root's
      // last.
      const begins =
        previous === undefined ||
        previous.dev !== row.dev ||
        (node.parent === null && at === rootRows);

      below.push(`${indent}${rowLine(row, begins)}`);
    }

    if (node.end !== undefined) {
      below.push(
        node.end.type === "open"
          ? `${indent}open`
          : node.end.cites.length === 0
            ? `${indent}closed`
            : `${indent}closed [${cites(node.end.cites)}]`,
      );
      return;
    }

    for (const [at, child] of index.children(node.id).entries()) {
      const first = child.rows[0];

      if (first === undefined) {
        continue;
      }

      // The split's step is named on its first branch.
      below.push(`${indent}- ${rowLine(first, at === 0)}`);
      write(child, 1, `${indent}  `);
    }
  };

  write(rootNode, rootRows, "");

  return below.length === 0
    ? out.join("\n")
    : [...out, "----", ...below].join("\n");
}
