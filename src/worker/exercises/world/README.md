# World exercise (`world@1`)

Students work with a *world*, a picture of a finite structure, in the
tradition of Barwise and Etchemendy's Tarski's World. The language's
predicates are interpreted by the picture: `LeftOf(a, b)` is true because
of where the blocks stand. The authoring contract is in
[`docs/carnap-markdown-v1.md`](../../../../docs/carnap-markdown-v1.md#world-directive).

## Layout

- `kinds/` — world kinds. `contract.ts` is the plugin contract;
  `index.ts` lists the kinds, and is the whole registration; `blocks/` is
  the first. A kind is not an exercise type: it lives inside this one and
  shares its machinery.
- `logic/structure.ts` — the world as a first-order `Structure` for the
  kit's evaluator, and the binding of the language's `blocks.*` roles to
  the kind's vocabulary.
- `logic/check.ts` — live truth values and the verdict for each variant,
  shared by the browser's Check and the grader.
- `logic/restriction.ts` — distinguish's `symbols=` / `without=`, checked
  on the parse tree, so `a≠b` is not blamed for a `¬`.
- `logic/game.ts` — the evaluation game: positions, the computer's moves,
  and the replay the grader scores a stored game by.
- `grading.ts` — stored public data resolved back into formulas and states.
- `authoring.ts`, `assessment.ts`, `read-only-view.ts`, `board-html.ts`,
  `strings.ts`, `verdict-text.ts` — the usual halves of a type.

The editor is `src/client/components/carnap-world-v1.tsx`, with
subformula highlighting in `world-highlight.tsx` and the game's panel in
`world-game.tsx`.

## World kinds

A kind supplies its states (tagged JSON, `blocks@1`), what each role in its
namespace means over them, the moves the editor makes (`apply`, which
returns a state or a refusal with its reason), how far one state is from
another (`distance`, what a budget counts), which pinned objects a state
breaks, a drawing, and its words. Everything but the words is DOM-free and
shared by browser and worker.

The drawing is a list of primitives in each piece's 100 × 100 box. The server
serializes them as SVG for the inert first paint and the review; the island
renders the same list, so the two cannot drift.

Adding a kind is a folder beside `blocks/` and a line in `kinds/index.ts`.
The editor island is written against blocks today; a kind with a different
board (a graph's free-floating vertices) adds a `WorldDrawing` layout and a
board component for it.

## Roles

A language says what a symbol means with a namespaced role:
`--| @syntax role blocks.left-of` over `LeftOf`. `roleIndex().roleOf` returns
only core (dot-free) roles, so to every other type a namespaced constructor is
role-less and reads as an ordinary predicate. `rolesIn("blocks")` gives this
type the role → constructor map. A role interprets one arity of its symbol,
because arity is part of a symbol's identity (`symbolKey`).

## Answer data

`world-answer@1` is `{ values?, world?, sentence?, games? }`; the variant
decides which is read and normalization drops the rest.

A game is `{ claim, choices }`: the first claim, and the student's choices in
order — a block's id for a quantifier, or `[left, right]` part values (each
`true`, `false`, or `null` for a part left open) for a connective. Values
rather than an option's index, so what a stored game means does not depend
on the order options are offered in. The computer's moves are not stored:
they are a fixed function of the position (the first object or part that
makes the student's claim false, else the first), which is what lets the
grader replay a game and score only one that was really won. A choice that
does not fit where it was made, or one after the game ended, loses. A world is kept as
submitted — a world that breaks the physics is a zero with a reason, not a
refused payload.

Objects are matched between the start world and the answer by id. Authored
objects are `o1…on`; the editor mints fresh ids. A student could choose ids
to pair objects differently, but any pairing counts at least as many changes
as the best one, so it can only bring the count down to the true minimum —
which is what a budget means.

## Not yet

Laws enforced after every edit and move counts need a replayed move log,
since they depend on the path; the editor is a reducer over typed moves so
that log is only a matter of keeping the list. They are shelved, as is an
isometric view. A graph kind is later, with its own design pass.
