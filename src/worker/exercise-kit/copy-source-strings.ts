import type { Translator } from "../i18n/translator";

/**
 * The author preview's "Copy as source" button and what it says once it has
 * copied (see `mountCopySource` in the client). Spread into the map of each
 * widget that offers one, the way {@link buildExerciseHelpStrings} is.
 *
 * The literals sit at the `i18n.t(...)` call sites because Lingui's extractor
 * reads string literals passed to a receiver *named* `i18n`.
 */
export function buildCopySourceStrings(i18n: Translator) {
  return {
    /** A preview-only button: copies the author's edited work as directive
     *  source, to paste into the exercise. */
    "Copy as source": i18n.t("Copy as source"),
    /** Said on the action bar once the copy has landed on the clipboard. */
    "Copied.": i18n.t("Copied."),
  };
}
