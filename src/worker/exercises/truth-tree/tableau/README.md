# tableau

A logic-free tableau: a tree of rows, the edits an editor makes to it, and
where each row goes on the page. The truth-tree exercise type owns it, and is
its only consumer. It knows nothing of the type's logic, so that it can be
lifted out, to the exercise kit or a package as ProofML was, once a second
consumer (a Priest tree with world labels, say) shows what the API has to be.

- `document.ts`: the shape. A node is a run of rows with no branching; its
  children are the branches a split below it made; a leaf may be closed or
  marked open. A row has `text`, the `cites` it is justified by, and the
  `dev` (development) it belongs to, all opaque here. `kind` and `prefix` are
  for consumers whose rows are not all formulas (`A, 0`, `0r1`, `T: A`).
  `TableauIndex` answers the navigation questions.
- `edit.ts`: pure edits, one document to the next, so undo is keeping the
  previous document. `remint` renames every id, for restoring saved work.
- `layout.ts`: lines and columns. Lines are shared across branches, as in the
  textbooks: a row takes the first line below its branch whose margin is free
  or carries the same citation, and skipped lines become a dotted guide. A
  step is justified once, beside its first line (`heads`, `marginLines`): a
  row under another of its development continues that step, with a blank
  margin, as in the book.
  Columns are leaves. The worker's read-only view and the browser editor
  both draw from it.

The browser view is `src/client/components/truth-tree-view.tsx`, a Preact
island over this core.

**Boundary.** Nothing here imports anything outside this folder: no other
worker code, not even the rest of the truth tree, no exercise kit, no DOM, no
framework (`tests/truth-tree-tableau.test.ts`). The view imports this and
Preact, and nothing else.