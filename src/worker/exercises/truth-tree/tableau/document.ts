/**
 * A tableau as data: a tree of nodes, each a run of rows with no branching,
 * and each leaf possibly closed or marked open.
 *
 * Nothing here knows any logic. A row's text is whatever the consumer puts in
 * it, and a row's `cites` and `dev` are opaque ids the consumer gives meaning
 * to: a truth tree says a row develops the rows it cites, and that the rows of
 * one development came from one application of one rule. A Priest tree would
 * put a world label in `prefix` and a relation row under another `kind`. The
 * shape (which rows sit on which branch) is all this module answers for.
 *
 * DOM-free and dependency-free. The worker, the browser island and the tests
 * all read the same document through it.
 */

/** One line of a tableau: a formula, or whatever a row `kind` says it is. */
export interface TableauRow {
  readonly id: string;
  /** The consumer's name for what this row is; a truth tree has one kind. */
  readonly kind?: string;
  /** Written before the text, such as a world label or a sign. */
  readonly prefix?: string;
  readonly text: string;
  /** The rows this one is justified by. Empty for a root row. */
  readonly cites: readonly string[];
  /** The development this row belongs to: every row one step wrote. */
  readonly dev: string;
}

/** How a branch ends, if it has been ended. */
export type TableauEnd =
  | { readonly type: "closed"; readonly cites: readonly string[] }
  | { readonly type: "open" };

/**
 * A run of rows with no branching. The root node has no parent. A node's
 * children, in order, are the branches a split below it made.
 */
export interface TableauNode {
  readonly id: string;
  readonly parent: string | null;
  readonly rows: readonly TableauRow[];
  readonly end?: TableauEnd;
}

export interface TableauDocument {
  /** Parents before their children, and siblings left to right. */
  readonly nodes: readonly TableauNode[];
}

/** Where a row is: its node, and its index among the node's rows. */
export interface RowLocation {
  readonly node: TableauNode;
  readonly index: number;
  readonly row: TableauRow;
}

/**
 * Lookups over a document: parents, children, and where each row sits. Built
 * once per document and read many times; a document is never mutated, so an
 * index never goes stale.
 */
export class TableauIndex {
  readonly root: TableauNode | null;
  readonly nodes: ReadonlyMap<string, TableauNode>;
  private readonly childLists: ReadonlyMap<string, readonly TableauNode[]>;
  private readonly rowLocations: ReadonlyMap<string, RowLocation>;

  constructor(readonly document: TableauDocument) {
    const nodes = new Map<string, TableauNode>();
    const children = new Map<string, TableauNode[]>();
    const rows = new Map<string, RowLocation>();
    let root: TableauNode | null = null;

    for (const node of document.nodes) {
      nodes.set(node.id, node);

      if (node.parent === null) {
        root ??= node;
      } else {
        const list = children.get(node.parent) ?? [];
        list.push(node);
        children.set(node.parent, list);
      }

      for (const [index, row] of node.rows.entries()) {
        rows.set(row.id, { index, node, row });
      }
    }

    this.root = root;
    this.nodes = nodes;
    this.childLists = children;
    this.rowLocations = rows;
  }

  children(nodeId: string): readonly TableauNode[] {
    return this.childLists.get(nodeId) ?? [];
  }

  parent(nodeId: string): TableauNode | null {
    const parent = this.nodes.get(nodeId)?.parent ?? null;
    return parent === null ? null : (this.nodes.get(parent) ?? null);
  }

  row(rowId: string): RowLocation | null {
    return this.rowLocations.get(rowId) ?? null;
  }

  /** The nodes from the root down to this one, inclusive. */
  path(nodeId: string): readonly TableauNode[] {
    const path: TableauNode[] = [];
    const seen = new Set<string>();
    let current = this.nodes.get(nodeId) ?? null;

    while (current !== null && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current =
        current.parent === null
          ? null
          : (this.nodes.get(current.parent) ?? null);
    }

    return path;
  }

  /**
   * Every node reachable from the root, parents first, siblings in order.
   * A node already visited is not visited again, so a document whose parent
   * links loop still has an end.
   */
  preorder(): readonly TableauNode[] {
    const order: TableauNode[] = [];
    const seen = new Set<string>();

    const visit = (node: TableauNode): void => {
      if (seen.has(node.id)) {
        return;
      }

      seen.add(node.id);
      order.push(node);

      for (const child of this.children(node.id)) {
        visit(child);
      }
    };

    if (this.root !== null) {
      visit(this.root);
    }

    return order;
  }

  /** The leaves under a node (the node itself if it has no children), left to right. */
  leaves(
    nodeId: string | null = this.root?.id ?? null,
  ): readonly TableauNode[] {
    const leaves: TableauNode[] = [];
    const seen = new Set<string>();

    const visit = (id: string): void => {
      const node = this.nodes.get(id);

      if (node === undefined || seen.has(id)) {
        return;
      }

      seen.add(id);
      const children = this.children(id);

      if (children.length === 0) {
        leaves.push(node);
      }

      for (const child of children) {
        visit(child.id);
      }
    };

    if (nodeId !== null) {
      visit(nodeId);
    }

    return leaves;
  }

  /** Every row on the branch ending at a leaf, from the root down. */
  branchRows(leafId: string): readonly TableauRow[] {
    return this.path(leafId).flatMap((node) => node.rows);
  }

  /**
   * The rows above a row on its own branch: every row of its ancestors, and
   * the rows before it in its own node.
   */
  rowsAbove(rowId: string): readonly TableauRow[] {
    const location = this.row(rowId);

    if (location === null) {
      return [];
    }

    const ancestors = this.path(location.node.id).slice(0, -1);

    return [
      ...ancestors.flatMap((node) => node.rows),
      ...location.node.rows.slice(0, location.index),
    ];
  }

  /** Whether a node is the given node or lies below it. */
  isAtOrBelow(nodeId: string, ancestorId: string): boolean {
    return this.path(nodeId).some((node) => node.id === ancestorId);
  }
}
