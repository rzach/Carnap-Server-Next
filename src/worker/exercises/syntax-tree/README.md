# Syntax-tree exercise (`syntax-tree@1`)

Students split a sentence by its main connectives until only atomic
sentences remain: gh #38, and old Carnap's `.SynChecker .Match`
(`Carnap-GHCJS/src/Carnap/GHCJS/Action/SyntaxCheck.hs`). The authoring
contract is in
[`docs/carnap-markdown-v1.md`](../../../../docs/carnap-markdown-v1.md#syntax-tree-directive).

## Layout

- `logic/tree.ts`: the tree. A node is a node of the parse at the
  sentence's sort, and its children are the nearest such nodes beneath it.
  Each node's sentence is printed on its own, and its runs are attributed
  by `printPieces` to the node whose connective they are. It also reads
  picks, typed ones included. DOM-free, shared by browser and worker.
- `grading.ts`: stored public data resolved back into a tree; which picks
  count, and the verdict.
- `display.ts`: what is drawn. `drawnTree` decides which nodes are shown
  and split, and turns each line into runs (a connective button with its
  screen-reader name, the main connective of a split line, an atom, a
  bracket). It is kept apart from `read-only-view.ts` so the element does
  not bundle the view's styles.
- `authoring.ts`, `assessment.ts`, `read-only-view.ts`, `strings.ts`: the
  usual halves of a type.

The element is `src/client/components/carnap-syntax-tree-v1.ts`. The server
view and the element only write out what `drawnTree` returns — one as a
string, the other with DOM calls — so neither makes a drawing decision the
other could make differently.

## Nothing knows a connective

Nothing here names one. A node's connective is whatever its own line prints
that no subsentence prints: `∧`, `¬`, the `∀` with its variable, `□`, or both
tokens of a two-token notation. So every language decomposes the same way,
including one an author declares. Roles are read only to name a button for
a screen reader ("∧, conjunction"). A role with no word in `strings.ts`
leaves the button named by its symbol.

## Answers and grading

An answer is the run of picks: `{ node, clicked }` for a click,
`{ node, named }` for a typed connective. Both are kept by structure, as
paths and constructor names, never by spelling. There is no answer key,
because the tree follows from the public sentence: the server parses the
stored engine text again and judges each pick against it.

Under `scoring="whole"` the element clears the run on a wrong pick, so what
arrives is the run since the last restart, and the grade is all or nothing.
Under `partial` each node keeps its first pick, and the grade is the share
right.

## Next

`depth="terms"` (stage 4 of #491): atoms split too, into predicate and
terms, down to variables and constants, and each bound occurrence is linked
to the quantifier that binds it, graded against `bindingSites` from
`@aufbau/syntax`.
