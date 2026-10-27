import type { Root } from "mdast";

import type { CompiledProse } from "../../domain/prose";
import { compileCarnapMarkdown } from "./compiler";
import { type CompilerDiagnostic, diagnostic } from "./diagnostics";
import { markdownParser } from "./markdown";

/**
 * What a compile says, the warnings of an accepted text included. The same
 * shape on both sides, so the editor in the browser can run this function and
 * list what the save would.
 */
export type ProseCompileResult =
  | {
      readonly diagnostics: readonly CompilerDiagnostic[];
      readonly ok: true;
      readonly prose: CompiledProse | null;
    }
  | {
      readonly diagnostics: readonly CompilerDiagnostic[];
      readonly ok: false;
    };

/**
 * Compile prose shown in the site's own chrome — an instance's About text, a
 * course's description: carnap-markdown, through the compiler a lesson goes
 * through, so it is refused and sanitized by the same rules, and an author who
 * writes lessons already knows what it accepts. Blank source is no prose at
 * all.
 *
 * Prose only. It is served in the site's chrome rather than in a lesson's
 * isolated document, so there is nowhere for an exercise to load or a
 * `:::style` block to apply, and a theory block has no exercise to serve.
 * Each is refused where it is written, with the compiler's own words for a
 * directive out of place, rather than compiled and then dropped unseen.
 *
 * Browser-safe: the editor's bundle runs it on every edit.
 */
export async function compileProse(
  source: string,
): Promise<ProseCompileResult> {
  const normalized = source.replaceAll("\r\n", "\n").trim();

  if (normalized.length === 0) {
    return { diagnostics: [], ok: true, prose: null };
  }

  const blocks = refusedBlocks(normalized);
  const compiled = await compileCarnapMarkdown(normalized);
  // What the compiler says about the inside of a refused block is beside the
  // point — an exercise's missing options, or the compiler's own refusal of an
  // unknown name — since the block cannot stay whatever it holds.
  const outsideBlocks = compiled.diagnostics.filter(
    (item) =>
      !blocks.some(
        (block) => item.line >= block.startLine && item.line <= block.endLine,
      ),
  );

  if (blocks.length > 0 || !compiled.ok) {
    return {
      diagnostics: [
        ...blocks.map((block) => block.diagnostic),
        ...outsideBlocks,
      ].sort((left, right) => left.line - right.line),
      ok: false,
    };
  }

  const html = compiled.artifact.document.nodes
    .map((node) => (node.kind === "markdown" ? node.html : ""))
    .join("\n");

  return {
    diagnostics: compiled.diagnostics,
    ok: true,
    prose: { html, source: normalized },
  };
}

interface RefusedBlock {
  readonly diagnostic: CompilerDiagnostic;
  readonly endLine: number;
  readonly startLine: number;
}

/** Every top-level block directive, each refused across the lines it spans. */
function refusedBlocks(source: string): RefusedBlock[] {
  const tree = markdownParser.parse(source) as Root;

  return tree.children.flatMap((node) => {
    if (node.type !== "containerDirective" && node.type !== "leafDirective") {
      return [];
    }

    const startLine = node.position?.start.line ?? 1;

    return [
      {
        diagnostic: diagnostic(
          startLine,
          "unsupported_directive",
          "Directive {name} is not supported here.",
          { params: { name: node.name } },
        ),
        endLine: node.position?.end.line ?? startLine,
        startLine,
      },
    ];
  });
}
