import type { SurfaceLanguage } from "@aufbau/syntax";
import type { TableauDocument, TableauEnd } from "../../src/tableau/document";
import { setEnd, splitNode, stackRows } from "../../src/tableau/edit";
import type { Formula } from "../../src/worker/exercise-kit/formula";
import { parseFormula } from "../../src/worker/exercise-kit/formula";
import type { TreeReport } from "../../src/worker/exercises/truth-tree/logic/check";
import { checkTree } from "../../src/worker/exercises/truth-tree/logic/check";
import { rowReader } from "../../src/worker/exercises/truth-tree/logic/formulas";
import type { TableauSystem } from "../../src/worker/exercises/truth-tree/logic/system";
import { FORALLX_UBC } from "../../src/worker/exercises/truth-tree/logic/system";
import { languageById } from "../../src/worker/logic/specs";

export const UBC = (() => {
  const found = languageById("forallx-ubc");

  if (found === null) {
    throw new Error("forallx-ubc does not ship");
  }

  return found;
})();

export function ubcFormula(
  text: string,
  lang: SurfaceLanguage = UBC,
): Formula {
  const read = parseFormula(text, lang);

  if (!read.ok) {
    throw new Error(`'${text}' does not parse: ${read.errors[0]?.message}`);
  }

  return read.formula;
}

/**
 * Builds a truth tree the way the editor does, through the tableau's own edit
 * operations: each `stack` and `split` is one development, citing one row
 * (or two, for a substitution by an identity).
 * The root rows are `r1`, `r2`, …, and each call returns the ids it made, so
 * a test can say which row a problem is on.
 */
export class TreeBuilder {
  private document: TableauDocument;
  private next = 0;
  readonly root: readonly string[];
  readonly rootNode = "n0";

  constructor(readonly rootTexts: readonly string[]) {
    this.document = {
      nodes: [
        {
          id: "n0",
          parent: null,
          rows: rootTexts.map((text, at) => ({
            cites: [],
            dev: "root",
            id: `r${at + 1}`,
            text,
          })),
        },
      ],
    };
    this.next = rootTexts.length;
    this.root = rootTexts.map((_, at) => `r${at + 1}`);
  }

  private mint = (): string => {
    this.next += 1;
    return `t${this.next}`;
  };

  /**
   * Stack rows at the end of a node, citing `cite` (or, for a substitution by
   * an identity, two rows): one development.
   */
  stack(
    node: string,
    cite: string | readonly string[] | null,
    texts: readonly string[],
  ): string[] {
    const dev = this.mint();
    const made = stackRows(
      this.document,
      node,
      texts.map((text) => ({
        cites:
          cite === null ? [] : typeof cite === "string" ? [cite] : [...cite],
        dev,
        text,
      })),
      this.mint,
    );
    this.document = made.document;
    return [...made.rows];
  }

  /**
   * Split a leaf, citing `cite`: one development over its new branches. The
   * result is typed as at least two branches, which every split is, so a
   * test can destructure it.
   */
  split(
    node: string,
    cite: string | null,
    branches: readonly (readonly string[])[],
  ): {
    readonly nodes: readonly [string, string, ...string[]];
    readonly rows: readonly [string[], string[], ...string[][]];
  } {
    const dev = this.mint();
    const made = splitNode(
      this.document,
      node,
      branches.map((texts) =>
        texts.map((text) => ({
          cites: cite === null ? [] : [cite],
          dev,
          text,
        })),
      ),
      this.mint,
    );
    this.document = made.document;
    let offset = 0;
    const rows = branches.map((texts) => {
      const slice = made.rows.slice(offset, offset + texts.length);
      offset += texts.length;
      return [...slice];
    });
    return {
      nodes: made.nodes as unknown as readonly [string, string, ...string[]],
      rows: rows as unknown as [string[], string[], ...string[][]],
    };
  }

  close(node: string, ...cites: string[]): this {
    return this.end(node, { cites, type: "closed" });
  }

  open(node: string): this {
    return this.end(node, { type: "open" });
  }

  private end(node: string, end: TableauEnd): this {
    this.document = setEnd(this.document, node, end);
    return this;
  }

  get tree(): TableauDocument {
    return this.document;
  }

  check(
    root?: readonly Formula[],
    system: TableauSystem = FORALLX_UBC,
  ): TreeReport {
    return checkTree({
      reader: rowReader(UBC),
      root: root ?? this.rootTexts.map((text) => ubcFormula(text)),
      system,
      tree: this.document,
    });
  }
}
