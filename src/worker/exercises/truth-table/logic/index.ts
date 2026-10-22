/**
 * The shared, DOM-free truth-table logic core. Imported by the worker (compile
 * + authoritative grade) and the client element (instant local check).
 */

export type {
  BinaryConnective,
  Formula,
  ParseError,
  ParseResult,
} from "./formula";
export {
  PROP_LANGUAGE_ID,
  parseEngineFormula,
  parseFormula,
  truthTableLanguage,
} from "./formula";
export type {
  CellRole,
  CellSegment,
  FormulaSegment,
  MarkSegment,
} from "./layout";
export { formulaLayout } from "./layout";
export {
  collectAtoms,
  enumerateValuations,
  evaluate,
  MAX_TABLE_ATOMS,
} from "./truth-table";
