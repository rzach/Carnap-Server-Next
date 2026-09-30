/**
 * What a truth tree draws beside its rows, from its check: the marks, the
 * margin notes, the closure citations, which rows to flag, and every row and
 * branch end in words. The server's static tree and the browser's editor both
 * hand these to the tableau component, which knows nothing of logic.
 *
 * DOM-free and catalog-free: words come through a {@link TreeWords} lookup.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";
import type { TableauDocument } from "../../../tableau/document";
import { TableauIndex } from "../../../tableau/document";
import type { TableauAnnotations } from "../../../tableau/html";
import type { TableauLayout } from "../../../tableau/layout";
import type { TreeReport } from "./logic/check";
import { isCitationProblem, isIncomplete } from "./logic/check";
import { marginText, markText, ruleLabel } from "./logic/labels";
import type { TreeWords } from "./verdict-text";

export function treeAnnotations(
  tree: TableauDocument,
  layout: TableauLayout,
  report: TreeReport,
  language: SurfaceLanguage,
  words: TreeWords,
  options: {
    readonly flag: boolean;
    /** How many of the root node's first rows are the exercise's root. */
    readonly rootRows: number;
  },
): TableauAnnotations {
  const index = new TableauIndex(tree);
  const number = (rowId: string): string => {
    const line = layout.rows.get(rowId)?.line;
    return line === undefined ? "?" : String(line);
  };
  const marks = new Map<string, string>();

  for (const [rowId, mark] of report.marks) {
    marks.set(rowId, markText(mark, language));
  }

  const margins = new Map<number, string>();

  // A step is justified once, beside its first line.
  for (const [line, ids] of layout.lineRows) {
    if (!layout.marginLines.has(line)) {
      continue;
    }

    for (const id of ids) {
      if (layout.heads.get(id) !== id) {
        continue;
      }

      const text = marginText(
        report.justifications.get(id),
        number,
        language,
      );

      if (text !== null) {
        margins.set(line, text);
        break;
      }
    }
  }

  const endNotes = new Map<string, string>();

  for (const node of tree.nodes) {
    if (node.end?.type === "closed" && node.end.cites.length > 0) {
      endNotes.set(node.id, node.end.cites.map(number).join(", "));
    }
  }

  // A problem is drawn on the field it is about: a wrong sentence under the
  // row, a wrong citation under the margin. A blank one is only unfinished.
  const flagged = new Set<string>(options.flag ? report.ends.keys() : []);
  const flaggedMargins = new Set<number>();

  for (const [rowId, problem] of options.flag ? report.rows : []) {
    if (isIncomplete(problem)) {
      continue;
    }

    if (!isCitationProblem(problem)) {
      flagged.add(rowId);
      continue;
    }

    // The step's citation is in the margin beside its first row.
    const line = layout.rows.get(layout.heads.get(rowId) ?? rowId)?.line;

    if (line !== undefined) {
      flaggedMargins.add(line);
    }
  }

  return {
    describeBranch: (position, count) =>
      words("Branch {position} of {count}", {
        count: String(count),
        position: String(position),
      }),
    describeEnd: (nodeId) => {
      const end = index.nodes.get(nodeId)?.end;

      if (end?.type === "open") {
        return words("Branch marked open and complete");
      }

      const [first, second] = end?.cites ?? [];

      if (first !== undefined && second !== undefined) {
        return words("Branch closed on rows {first} and {second}", {
          first: number(first),
          second: number(second),
        });
      }

      return first !== undefined
        ? words("Branch closed on row {row}", { row: number(first) })
        : words("Branch closed");
    },
    describeRow: (rowId) => {
      const text = index.row(rowId)?.row.text.trim() ?? "";
      const shown = text === "" ? words("Empty row") : text;
      const justification = report.justifications.get(rowId);
      const [cited, other] = justification?.cites ?? [];

      if (cited === undefined) {
        return isRootRow(index, rowId, options.rootRows)
          ? words("Row {row}: {text}", { row: number(rowId), text: shown })
          : words("Row {row}: {text}, not yet cited", {
              row: number(rowId),
              text: shown,
            });
      }

      const rule =
        justification?.rule === null || justification?.rule === undefined
          ? "?"
          : ruleLabel(justification.rule, language);

      return other === undefined
        ? words("Row {row}: {text}, from row {cited}, {rule}", {
            cited: number(cited),
            row: number(rowId),
            rule,
            text: shown,
          })
        : words("Row {row}: {text}, from rows {cited} and {other}, {rule}", {
            cited: number(cited),
            other: number(other),
            row: number(rowId),
            rule,
            text: shown,
          });
    },
    endNotes,
    flagged,
    flaggedMargins,
    margins,
    marks,
  };
}

/** A root row: one of the root node's first rows, which the exercise gives. */
function isRootRow(
  index: TableauIndex,
  rowId: string,
  rootRows: number,
): boolean {
  const location = index.row(rowId);
  return location?.node.parent === null && location.index < rootRows;
}
