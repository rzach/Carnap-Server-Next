import { BLOCKS_SPEC_SOURCE } from "./blocks-language";

/**
 * A lesson of world exercises, one of each variant, set in the example
 * blocks language. `bun run scripts/seed-demo.ts world` seeds it onto a local
 * dev server.
 */
export const WORLD_DEMO_SOURCE = `# Worlds of blocks

A world is a picture of a structure. The sentences below are about the
blocks on the board: \`Cube(a)\` is true because of what \`a\` is, and
\`LeftOf(a, b)\` because of where the two stand. Columns run left to right,
and rows run back to front, so row 8 is the one nearest you.

:::aufbau-mm0{name="blocks-lpl"}
${BLOCKS_SPEC_SOURCE}:::

## Build a world

::::world{#lefty system="blocks-lpl" budget="2" points="3" title="Make them true"}
Change at most two blocks so that every sentence comes out as marked.
No two blocks may share a row.

- ∀x(Cube(x) → ∃y LeftOf(y,x))
- false: ∃x Large(x)
- ∃x∃y(Adjoins(x,y) ∧ SameShape(x,y))

| law : ∀x∀y(SameRow(x,y) → x = y)
| pinned block : small tet at 1,1 named a
| block : large cube at 4,3 named b
| block : medium dodec at 6,7
::::

## Evaluate

::::world{#judge system="blocks-lpl" variant="evaluate" points="4" title="True or false?"}
Say whether each sentence is true in this world.

- Cube(a)
- ∃x(Tet(x) ∧ LeftOf(x, a))
- ∀x(Dodec(x) → Large(x))
- Between(c, a, b)

| block : small cube at 2,6 named a
| block : large dodec at 6,2 named b
| block : medium tet at 4,4 named c
| block : large dodec at 7,7
::::

## A counterexample

::::world{#counter system="blocks-lpl" variant="counterexample" points="2" title="Not valid"}
Build a world in which the premises are true and the conclusion false.

∀x(Cube(x) → Small(x)), ∃x Cube(x) :|-: ∀x Small(x)
::::

## Tell them apart

::::world{#tell system="blocks-lpl" variant="distinguish" without="=" points="2" title="Two worlds"}
Write a sentence that is true in world A and false in world B, without
using identity.

| A block : small cube at 2,2 named a
| A block : small cube at 5,2
| B block : small cube at 2,2 named a
| B block : large dodec at 5,6
::::
`;
