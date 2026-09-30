/**
 * The edits a tableau editor makes, as pure functions from one document to
 * the next. An editor keeps its history as a list of documents, so undo is
 * taking the previous one back.
 *
 * These are shape operations and nothing more. Whether a branch may still be
 * extended, which rows a step should write, and what deleting a split's only
 * row should mean are the consumer's decisions, made before it calls here.
 */

import type {
  TableauDocument,
  TableauEnd,
  TableauNode,
  TableauRow,
} from "./document";
import { TableauIndex } from "./document";

/** A row before it has an id. */
export type RowDraft = Omit<TableauRow, "id">;

/** Makes a fresh id; an editor passes a counter, a test a fixed sequence. */
export type Mint = () => string;

function withRows(draft: readonly RowDraft[], mint: Mint): TableauRow[] {
  return draft.map((row) => ({ ...row, id: mint() }));
}

function replaceNode(
  document: TableauDocument,
  nodeId: string,
  change: (node: TableauNode) => TableauNode,
): TableauDocument {
  return {
    nodes: document.nodes.map((node) =>
      node.id === nodeId ? change(node) : node,
    ),
  };
}

/** Append rows to the end of a node (normally a leaf). */
export function stackRows(
  document: TableauDocument,
  nodeId: string,
  draft: readonly RowDraft[],
  mint: Mint,
): { readonly document: TableauDocument; readonly rows: readonly string[] } {
  const rows = withRows(draft, mint);

  return {
    document: replaceNode(document, nodeId, (node) => ({
      ...node,
      rows: [...node.rows, ...rows],
    })),
    rows: rows.map((row) => row.id),
  };
}

/**
 * Branch a leaf: one new child per entry, each starting with its rows. The
 * children are appended to the document, which keeps parents before children
 * and siblings in order; the tree's own order comes from the parent links.
 */
export function splitNode(
  document: TableauDocument,
  nodeId: string,
  branches: readonly (readonly RowDraft[])[],
  mint: Mint,
): {
  readonly document: TableauDocument;
  readonly nodes: readonly string[];
  readonly rows: readonly string[];
} {
  const children: TableauNode[] = branches.map((draft) => ({
    id: mint(),
    parent: nodeId,
    rows: withRows(draft, mint),
  }));

  return {
    document: { nodes: [...document.nodes, ...children] },
    nodes: children.map((child) => child.id),
    rows: children.flatMap((child) => child.rows.map((row) => row.id)),
  };
}

/** Insert a row directly after another, in the same node. */
export function insertRowAfter(
  document: TableauDocument,
  afterRowId: string,
  draft: RowDraft,
  mint: Mint,
): { readonly document: TableauDocument; readonly row: string } | null {
  const location = new TableauIndex(document).row(afterRowId);

  if (location === null) {
    return null;
  }

  const row: TableauRow = { ...draft, id: mint() };

  return {
    document: replaceNode(document, location.node.id, (node) => ({
      ...node,
      rows: [
        ...node.rows.slice(0, location.index + 1),
        row,
        ...node.rows.slice(location.index + 1),
      ],
    })),
    row: row.id,
  };
}

/** Every node below this one (not the node itself). */
function descendants(index: TableauIndex, nodeId: string): Set<string> {
  const found = new Set<string>();
  const visit = (id: string): void => {
    for (const child of index.children(id)) {
      found.add(child.id);
      visit(child.id);
    }
  };

  visit(nodeId);
  return found;
}

/**
 * Remove a row. A node left with no rows is removed too, with everything
 * below it; the root node stays, even empty.
 */
export function removeRow(
  document: TableauDocument,
  rowId: string,
): TableauDocument {
  const index = new TableauIndex(document);
  const location = index.row(rowId);

  if (location === null) {
    return document;
  }

  const { node } = location;

  if (node.rows.length > 1 || node.parent === null) {
    return replaceNode(document, node.id, (current) => ({
      ...current,
      rows: current.rows.filter((row) => row.id !== rowId),
    }));
  }

  const gone = descendants(index, node.id);
  gone.add(node.id);

  return { nodes: document.nodes.filter((each) => !gone.has(each.id)) };
}

/** Remove every node below a node, which makes it a leaf again. */
export function removeChildren(
  document: TableauDocument,
  nodeId: string,
): TableauDocument {
  const gone = descendants(new TableauIndex(document), nodeId);
  return { nodes: document.nodes.filter((node) => !gone.has(node.id)) };
}

export function setRowText(
  document: TableauDocument,
  rowId: string,
  text: string,
): TableauDocument {
  return {
    nodes: document.nodes.map((node) =>
      node.rows.some((row) => row.id === rowId)
        ? {
            ...node,
            rows: node.rows.map((row) =>
              row.id === rowId ? { ...row, text } : row,
            ),
          }
        : node,
    ),
  };
}

/** Set the citations of several rows at once, such as every row of a step. */
export function setRowCites(
  document: TableauDocument,
  rowIds: readonly string[],
  cites: readonly string[],
): TableauDocument {
  const targets = new Set(rowIds);

  return {
    nodes: document.nodes.map((node) =>
      node.rows.some((row) => targets.has(row.id))
        ? {
            ...node,
            rows: node.rows.map((row) =>
              targets.has(row.id) ? { ...row, cites: [...cites] } : row,
            ),
          }
        : node,
    ),
  };
}

/** End a branch, or reopen it with `undefined`. */
export function setEnd(
  document: TableauDocument,
  nodeId: string,
  end: TableauEnd | undefined,
): TableauDocument {
  return replaceNode(document, nodeId, (node) => {
    const { end: _previous, ...rest } = node;
    return end === undefined ? rest : { ...rest, end };
  });
}

/**
 * The same tableau with every id minted fresh, citations and developments
 * remapped to match. Ids are editing handles: an editor restoring saved work
 * remints, so an id from one session can never collide with one it mints
 * later.
 */
export function remint(
  document: TableauDocument,
  mint: Mint,
): TableauDocument {
  const ids = new Map<string, string>();
  const fresh = (id: string): string => {
    let next = ids.get(id);

    if (next === undefined) {
      next = mint();
      ids.set(id, next);
    }

    return next;
  };
  // Rows and nodes first, so a citation of a row that exists maps to that
  // row's new id wherever it is written.
  for (const node of document.nodes) {
    fresh(`node:${node.id}`);

    for (const row of node.rows) {
      fresh(`row:${row.id}`);
    }
  }

  const row = (id: string): string =>
    ids.get(`row:${id}`) ?? fresh(`row:${id}`);

  return {
    nodes: document.nodes.map((node) => ({
      ...node,
      id: fresh(`node:${node.id}`),
      parent: node.parent === null ? null : fresh(`node:${node.parent}`),
      rows: node.rows.map((each) => ({
        ...each,
        cites: each.cites.map(row),
        dev: fresh(`dev:${each.dev}`),
        id: row(each.id),
      })),
      ...(node.end === undefined
        ? {}
        : {
            end:
              node.end.type === "closed"
                ? { cites: node.end.cites.map(row), type: "closed" as const }
                : node.end,
          }),
    })),
  };
}
