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
  by `printPieces` to the node whose connective they are. It also judges
  picks. DOM-free, shared by browser and worker.
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

An answer is the run of picks: `{ node, clicked }` for a connective
pressed, `{ node, linked }` for a variable linked (see below). Both are kept
by structure, as paths, never by spelling. There is no answer key,
because the tree follows from the public sentence: the server parses the
stored engine text again and judges each pick against it.

Under `scoring="whole"` the element clears the run on a wrong pick, so what
arrives is the run since the last restart, and the grade is all or nothing.
Under `partial` each node keeps its first pick, and the grade is the share
right.

## Through the terms

At `depth="terms"` every node of the parse is a node of the tree, whatever
its sort, so an atom splits at its predicate, `=` or function symbol, down
to variables and names. Three kinds of parse node are looked through, since
a reader sees nothing of them: a coercion, a node of the argument-list sort
(its terms become the predicate's children, and its comma belongs to no
one), and a quantifier's own variable, which stays in its operator (`∀x`).
`logic/tree.ts`'s `treeShape` is the one place that says this.

A variable whose sort some constructor binds is a leaf with a link to make.
Its true link is `bindingSites` from `@aufbau/syntax`, the innermost binding
occurrence, whose parent is the quantifier node the student links to. A link
is a pick, `{ node, linked }`, scored like a split. While a variable is being
linked, `drawnTree` turns every quantifier in the tree into a button, not
only those above it: offering just the quantifiers whose scope holds the
variable would answer half the question. Linking to one elsewhere is a
wrong pick.

No sentence sort is needed here, so a language of terms alone is read at any
sort; the connectives-only refusal stays for `depth="connectives"`.

## Lines

The lines joining the nodes, and each variable to its quantifier, are an SVG
the element draws behind the laid-out nodes from their measured boxes
(`src/client/components/syntax-tree-lines.ts`), and redraws when the tree's
box changes. A link runs only through the clear channels the tree leaves —
a gutter beside it and the gaps between rows — so it never crosses a
sentence: each quantifier's links are one bus with its own lane and its own
height in every gap, so no two quantifiers share a run, and a dot marks each
join so it is not read as a crossing. A gap is shared only by the runs that
cross it, and grows when more cross it than fit. That is the one drawing the server
cannot do, so the review loads the element too; its hydration says `review`
and carries no public data, and the element only draws the lines over the
tree the server wrote, from its `data-path`, `data-state` and `data-bound-by`
attributes.
