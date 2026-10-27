import type { Context } from "hono";
import { raw } from "hono/html";
import type { Child, FC } from "hono/jsx";

import type { CompilerDiagnostic } from "../application/content/diagnostics";
import type { AppBindings } from "../http";
import { CsrfInput, Sheet } from "./components";
import { DiagnosticsList } from "./content";
import { useI18n } from "./layout";
import {
  EDITOR_UI_STRINGS_ATTRIBUTE,
  editorUiStrings,
  uiStringsScript,
} from "./ui-strings";

const PROSE_SOURCE_FIELD_ID = "prose-source";

/**
 * The editor for prose shown in the site's own chrome — the About text, a
 * course description (see `compileProse`). A refused save comes back here
 * with the text as it was sent and the compiler's diagnostics under it, so
 * nothing typed is lost to an error page.
 *
 * The lesson editor's field, hooks and bundle: `editor-preview.js` puts the
 * same CodeMirror view in front of the textarea and lists the diagnostics as
 * the author types, compiling as the save will (`data-source-format`). With
 * no script it is a plain textarea, and the save says the same things.
 */
export const ProseEditor: FC<{
  readonly action: string;
  readonly context: Context<AppBindings>;
  /** What the text is for and where it is shown: the sheet's one line. */
  readonly description: string;
  readonly diagnostics: readonly CompilerDiagnostic[];
  /** Beside Save: the way to the page the text is read on. */
  readonly footerLink: Child;
  readonly source: string;
  readonly title: string;
}> = ({
  action,
  context,
  description,
  diagnostics,
  footerLink,
  source,
  title,
}) => {
  const i18n = useI18n();

  return (
    <>
      <form action={action} method="post">
        <CsrfInput context={context} />
        <Sheet
          className="source-sheet"
          description={description}
          footer={
            <div class="footer-row">
              <button type="submit">{i18n.t("Save")}</button>
              {footerLink}
            </div>
          }
          title={title}
        >
          {/* Hidden for the reason the lesson editor's is: the sheet's heading
              says what the field is, and the CodeMirror view takes its name
              from this label's id. */}
          <label
            class="visually-hidden"
            for={PROSE_SOURCE_FIELD_ID}
            id={`${PROSE_SOURCE_FIELD_ID}-label`}
          >
            {i18n.t("Carnap Markdown")}
          </label>
          <textarea
            data-editor-source
            data-source-format="prose"
            id={PROSE_SOURCE_FIELD_ID}
            name="source"
            rows={18}
            spellcheck={false}
          >
            {source}
          </textarea>
          <div data-editor-diagnostics>
            <DiagnosticsList diagnostics={diagnostics} />
          </div>
        </Sheet>
      </form>
      {raw(
        uiStringsScript(
          EDITOR_UI_STRINGS_ATTRIBUTE,
          editorUiStrings(i18n, context.get("language")),
        ),
      )}
      <script src="/assets/editor-preview.js" type="module" />
    </>
  );
};
