/**
 * Prose an author wrote in carnap-markdown for the site's own chrome — an
 * instance's About text, a course's description — kept as it was written and
 * as it compiled, the way a lesson keeps its source and its artifact: the
 * source is what the editor shows again, and the HTML, sanitized on save, is
 * what a reader is served without compiling anything.
 */
export interface CompiledProse {
  readonly html: string;
  readonly source: string;
}
