import type { Context } from "hono";
import { raw } from "hono/html";
import type { CompilerDiagnostic } from "../application/content/diagnostics";
import type { AboutPage } from "../domain/site-settings";
import type { AppBindings } from "../http";
import { splitAtValue, VALUE } from "../i18n/translator";
import { CARNAP_SOURCE_URL } from "../user-agent";
import { adminCrumb } from "./breadcrumbs";
import { CsrfInput, Notice, Sheet } from "./components";
import { DiagnosticsList } from "./content";
import { renderShell } from "./layout";
import {
  EDITOR_UI_STRINGS_ATTRIBUTE,
  editorUiStrings,
  uiStringsScript,
} from "./ui-strings";

const COMMIT = /^[0-9a-f]{7,40}$/i;

/**
 * The commit `CARNAP_COMMIT` names, or null when it is unset or is not a
 * commit hash: a value the page would link to GitHub has to be one GitHub can
 * answer for, and a mistyped deploy variable is better shown as nothing.
 */
export function buildCommit(value: string | undefined): string | null {
  const commit = value?.trim() ?? "";

  return COMMIT.test(commit) ? commit.toLowerCase() : null;
}

/**
 * `/about`, for anyone, signed in or not. The instance's own text comes first,
 * because it is what a reader who followed the footer link for an Impressum or
 * a privacy notice came for; what every instance says about Carnap follows.
 */
export function renderAboutPage(
  context: Context<AppBindings>,
  model: { readonly commit: string | null; readonly page: AboutPage | null },
): Response {
  const i18n = context.get("i18n");
  const [beforeSource, afterSource] = splitAtValue(
    i18n.t(
      "Carnap is a platform for teaching and practicing formal logic. Its source code is on {github}.",
      { github: VALUE },
    ),
  );
  const [beforeCommit, afterCommit] = splitAtValue(
    i18n.t("This instance runs commit {commit}.", { commit: VALUE }),
  );

  return renderShell(
    context,
    { title: i18n.t("About") },
    <>
      {model.page === null ? null : (
        // Compiled and sanitized on save, by the compiler a lesson goes
        // through; see `compileAboutPage`.
        <Sheet className="about-text">{raw(model.page.html)}</Sheet>
      )}
      <Sheet title="Carnap">
        <p>
          {beforeSource}
          <a href={CARNAP_SOURCE_URL}>GitHub</a>
          {afterSource}
        </p>
        {model.commit === null ? null : (
          <p>
            {beforeCommit}
            <a href={`${CARNAP_SOURCE_URL}/commit/${model.commit}`}>
              <code>{model.commit.slice(0, 7)}</code>
            </a>
            {afterCommit}
          </p>
        )}
      </Sheet>
    </>,
  );
}

const ABOUT_SOURCE_FIELD_ID = "about-source";
const ABOUT_SOURCE_LABEL_ID = "about-source-label";

/**
 * The About page's editor, a site administrator's alone. A refused save comes
 * back here with the text as it was sent and the compiler's diagnostics under
 * it, so nothing typed is lost to an error page.
 *
 * The lesson editor's field, hooks and bundle: `editor-preview.js` puts the
 * same CodeMirror view in front of the textarea and lists the diagnostics as
 * the author types, compiling with `compileAboutPage` (`data-source-format`).
 * With no script it is a plain textarea, and the save says the same things.
 */
export function renderAboutEditor(
  context: Context<AppBindings>,
  model: {
    readonly diagnostics: readonly CompilerDiagnostic[];
    readonly saved: boolean;
    readonly source: string;
  },
): Response {
  const i18n = context.get("i18n");

  return renderShell(
    context,
    { breadcrumb: [adminCrumb(i18n)], title: i18n.t("About page") },
    <>
      {model.saved ? <Notice>{i18n.t("Change saved.")}</Notice> : null}
      <form action="/admin/about" method="post">
        <CsrfInput context={context} />
        <Sheet
          className="source-sheet"
          description={i18n.t(
            "Shown to everyone at /about, signed in or not, above what every Carnap instance says about itself. Write it in Carnap Markdown, as a lesson's prose; leave it empty to show only that part.",
          )}
          footer={
            <div class="footer-row">
              <button type="submit">{i18n.t("Save")}</button>
              <a href="/about">{i18n.t("View the About page")}</a>
            </div>
          }
          title={i18n.t("Instance text")}
        >
          {/* Hidden for the reason the lesson editor's is: the sheet's heading
              says what the field is, and the CodeMirror view takes its name
              from this label's id. */}
          <label
            class="visually-hidden"
            for={ABOUT_SOURCE_FIELD_ID}
            id={ABOUT_SOURCE_LABEL_ID}
          >
            {i18n.t("Carnap Markdown")}
          </label>
          <textarea
            data-editor-source
            data-source-format="about"
            id={ABOUT_SOURCE_FIELD_ID}
            name="source"
            rows={18}
            spellcheck={false}
          >
            {model.source}
          </textarea>
          <div data-editor-diagnostics>
            <DiagnosticsList diagnostics={model.diagnostics} />
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
    </>,
  );
}
