/**
 * Write the subscripted names of `forallx-ubc.mm0`, `a1`…`w9`, with the
 * delimiters and the elab rules that read and print them as `a₁`…`w₉`.
 *
 * The book lets any letter take a numeric subscript. An MM0 signature is a
 * finite vocabulary and its identifiers are ASCII, so the spec declares the
 * subscripted names it will read, as ordinary identifiers, and gives each one
 * an invertible elab rule that spells it with a real subscript. The list is
 * long and regular, so it is written by this script rather than by hand, into
 * the block between the two marker lines. The names' `@vars` pool lists the
 * same identifiers, and the script writes that line too.
 *
 * Names only. A tree needs fresh names, never fresh variables, and `x3` as a
 * variable would take the `x3` out of `@x3yRxy`, where `3` is the ASCII `∃`.
 *
 *     bun scripts/forallx-ubc-lexicon.ts           # rewrite the block
 *     bun scripts/forallx-ubc-lexicon.ts --check   # exit 1 if it is stale
 */

const FILE = new URL(
  "../src/worker/logic/theories/forallx-ubc.mm0",
  import.meta.url,
);

const BEGIN =
  "-- BEGIN generated subscripts (scripts/forallx-ubc-lexicon.ts)";
const END = "-- END generated subscripts";

const NAMES = [..."abcdefghijklmnopqrstuvw"];
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

const names = NAMES.flatMap((letter) =>
  DIGITS.map((digit) => `${letter}${digit}`),
);

function block(): string {
  const lines = [BEGIN, `--| @syntax delimiter $ ${names.join(" ")} $`];

  for (const identifier of names) {
    const letter = identifier.slice(0, 1);
    const digit = SUBSCRIPT[Number(identifier.slice(1))];
    lines.push(
      `--| @syntax elab $ ${letter} ${digit} $ => $ ${identifier} $`,
    );
  }

  lines.push(END);
  return lines.join("\n");
}

const NAME_POOL = `--| @vars ${[...NAMES, ...names].join(" ")}`;

function regenerate(source: string): string {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);

  if (start < 0 || end < start) {
    throw new Error("forallx-ubc.mm0 has no generated-subscripts block");
  }

  return (
    source.slice(0, start) +
    block() +
    source.slice(end + END.length)
  ).replace(/^--\| @vars a b c\b.*$/m, NAME_POOL);
}

const source = await Bun.file(FILE).text();
const next = regenerate(source);

if (process.argv.includes("--check")) {
  if (next !== source) {
    console.error(
      "forallx-ubc.mm0 is stale: run bun scripts/forallx-ubc-lexicon.ts",
    );
    process.exit(1);
  }
} else if (next !== source) {
  await Bun.write(FILE, next);
  console.log("forallx-ubc.mm0: subscripted lexicon rewritten");
}
