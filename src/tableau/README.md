# tableau

A logic-free tableau: a tree of rows, the edits an editor makes to it, and
where each row goes on the page. The truth-tree exercise type is its first
consumer. It is kept apart so that a second (a Priest tree with world labels,
a signed tableau) can reuse it, and so that it can become a package, as
ProofML did, once that second consumer shows what the API has to be.

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

The browser view is `src/client/tableau/`, a Preact island over this core.

**Boundary.** Nothing here imports anything outside `src/tableau/`: no
worker code, no exercise kit, no DOM, no framework
(`tests/tableau.test.ts`). The view imports this and Preact, and nothing
else.
