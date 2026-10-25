import type { Root } from "mdast";

import type { AboutPage } from "../domain/site-settings";
import { compileCarnapMarkdown } from "./content/compiler";
import { type CompilerDiagnostic, diagnostic } from "./content/diagnostics";
import { markdownParser } from "./content/markdown";
import type { AppStores } from "./stores";

/** Long enough for an Impressum and a privacy notice together, with room over. */
export const ABOUT_PAGE_MAX_LENGTH = 100_000;

/**
 * What a compile says, the warnings of an accepted text included. The same
 * shape on both sides, so the editor in the browser can run this function and
 * list what the save would.
 */
export type AboutPageCompileResult =
  | {
      readonly diagnostics: readonly CompilerDiagnostic[];
      readonly ok: true;
      readonly page: AboutPage | null;
    }
  | {
      readonly diagnostics: readonly CompilerDiagnostic[];
      readonly ok: false;
    };

/**
 * Compile an instance's About text: carnap-markdown, through the compiler a
 * lesson goes through, so it is refused and sanitized by the same rules, and
 * an administrator who writes lessons already knows what it accepts. Blank
 * source is no page at all.
 *
 * Prose only. The page is served in the site's own chrome rather than in a
 * lesson's isolated document, so there is nowhere for an exercise to load or
 * a `:::style` block to apply, and a theory block has no exercise to serve.
 * Each is refused where it is written, with the compiler's own words for a
 * directive out of place, rather than compiled and then dropped unseen.
 *
 * Browser-safe: the editor's bundle runs it on every edit.
 */
export async function compileAboutPage(
  source: string,
): Promise<AboutPageCompileResult> {
  const normalized = source.replaceAll("\r\n", "\n").trim();

  if (normalized.length === 0) {
    return { diagnostics: [], ok: true, page: null };
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
    page: { html, source: normalized },
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

/** The instance's About text, for anyone: the page is public by design. */
export async function readAboutPage(
  stores: AppStores,
): Promise<AboutPage | null> {
  return (await stores.siteSettings.read()).about;
}
