import type { SurfaceLanguage } from "@aufbau/syntax";

import { languageFromSource } from "../../src/worker/logic/specs";

/**
 * A complete blocks language, the one `docs/carnap-markdown-v1.md` gives as
 * the worked example for the world exercise: every `blocks.*` role the kind
 * interprets, spelled the way Barwise and Etchemendy spell it, with the
 * connectives and quantifiers.
 *
 * Two things about it are not arbitrary.
 *
 *   - **Predicates take an argument list.** `LeftOf (sq: seq): wff` rather
 *     than `LeftOf (x y: tm): wff`, because the parser reads a bracketed
 *     application one bracket per binder: the second would read `LeftOf(a)(b)`
 *     and not `LeftOf(a,b)`. A role then interprets one arity of the symbol,
 *     and `LeftOf(a,b,c)` is a symbol the world has no meaning for.
 *   - **Every letter and every predicate name is a delimiter.** The printer
 *     writes a quantifier straight onto what follows it, `∃yLeftOf(y,x)`, and
 *     the stored form of a sentence is that text; without the letters as
 *     delimiters `yLeftOf` would be one chunk and the stored sentence would
 *     not read back. Declaring the names too keeps each one whole, and the
 *     longest match keeps `Smaller` from reading as `Small` and `er`.
 */
export const BLOCKS_SPEC_SOURCE = `--| @syntax delimiter $ ( ) , = ¬ ∧ ∨ → ↔ ∀ ∃ $
--| @syntax delimiter $ a b c d e f u v w x y z $
--| @syntax delimiter $ Tet Cube Dodec Small Medium Large Smaller Larger $
--| @syntax delimiter $ SameSize SameShape LeftOf RightOf BackOf FrontOf $
--| @syntax delimiter $ SameRow SameCol Adjoins Between $
--| @syntax brackets ( )
--| @syntax display drop-outer-parens
--| @syntax lint closed-sentences
--| @syntax role sentence
provable sort wff;
--| @vars u v w x y z
sort var;
--| @vars a b c d e f
sort name;
--| @syntax role individual
sort tm;
--| @syntax role argument-list
sort seq;
term v2t (x: var): tm;
coercion v2t: var > tm;
term n2t (a: name): tm;
coercion n2t: name > tm;
term t2s (te: tm): seq;
coercion t2s: tm > seq;
--| @syntax elided
term snil: seq;
term scomma (sq tq: seq): seq;
infixl scomma: $,$ prec 10;

--| @syntax role blocks.tet
term Tet (sq: seq): wff;
--| @syntax role blocks.cube
term Cube (sq: seq): wff;
--| @syntax role blocks.dodec
term Dodec (sq: seq): wff;
--| @syntax role blocks.small
term Small (sq: seq): wff;
--| @syntax role blocks.medium
term Medium (sq: seq): wff;
--| @syntax role blocks.large
term Large (sq: seq): wff;
--| @syntax role blocks.smaller
term Smaller (sq: seq): wff;
--| @syntax role blocks.larger
term Larger (sq: seq): wff;
--| @syntax role blocks.same-size
term SameSize (sq: seq): wff;
--| @syntax role blocks.same-shape
term SameShape (sq: seq): wff;
--| @syntax role blocks.left-of
term LeftOf (sq: seq): wff;
--| @syntax role blocks.right-of
term RightOf (sq: seq): wff;
--| @syntax role blocks.back-of
term BackOf (sq: seq): wff;
--| @syntax role blocks.front-of
term FrontOf (sq: seq): wff;
--| @syntax role blocks.same-row
term SameRow (sq: seq): wff;
--| @syntax role blocks.same-col
term SameCol (sq: seq): wff;
--| @syntax role blocks.adjoins
term Adjoins (sq: seq): wff;
--| @syntax role blocks.between
term Between (sq: seq): wff;

--| @syntax role identity
term eq (x y: tm): wff;
infixl eq: $=$ prec 50;
--| @syntax role negation
term not (p: wff): wff;
prefix not: $¬$ prec 40;
--| @syntax role conjunction
term and (p q: wff): wff;
infixl and: $∧$ prec 30;
--| @syntax role disjunction
term or (p q: wff): wff;
infixl or: $∨$ prec 30;
--| @syntax role conditional
term imp (p q: wff): wff;
infixr imp: $→$ prec 20;
--| @syntax role biconditional
term iff (p q: wff): wff;
infixr iff: $↔$ prec 20;
--| @syntax role forall
term all {x: var} (p: wff x): wff;
prefix all: $∀$ prec 40;
--| @syntax role exists
term ex {x: var} (p: wff x): wff;
prefix ex: $∃$ prec 40;
`;

/** The fixture read as a language, or a thrown error naming the fixture. */
export function blocksLanguage(
  source: string = BLOCKS_SPEC_SOURCE,
): SurfaceLanguage {
  const language = languageFromSource(source);

  if (language === null) {
    throw new Error("the blocks fixture does not read as a language");
  }

  return language;
}
