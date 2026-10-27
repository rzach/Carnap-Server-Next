import type { Context } from "hono";
import type { Child, FC } from "hono/jsx";

import type { AppErrorStatus } from "../application/errors";
import type { AppBindings } from "../http";
import type { Translator } from "../i18n/translator";
import { ErrorSummary, Sheet } from "./components";
import type { Crumb } from "./layout";
import { renderShell } from "./layout";

/**
 * Standalone HTML error page for a failed form submission. Form POST handlers
 * catch `AppHttpError` and render this so a browser interaction (e.g. a typo or
 * a rejected action) is answered in the page's own terms — with the breadcrumb
 * and heading of wherever the reader was — rather than by the generic
 * {@link renderErrorPage} the global handler falls back to.
 */
export function renderFormError(
  context: Context<AppBindings>,
  options: {
    readonly breadcrumb?: readonly Crumb[];
    /** Answer a chrome-free page in kind (see `ShellOptions.chromeless`). */
    readonly chromeless?: boolean;
    readonly message: string;
    readonly status: AppErrorStatus;
    readonly title: string;
  },
): Response {
  return renderShell(
    context,
    {
      ...(options.breadcrumb === undefined
        ? {}
        : { breadcrumb: options.breadcrumb }),
      ...(options.chromeless === true ? { chromeless: true } : {}),
      status: options.status,
      title: options.title,
    },
    <ErrorSummary>{options.message}</ErrorSummary>,
  );
}

/**
 * What went wrong, in the reader's words. The status is the only thing the
 * global handler knows about an error it did not raise itself, so the heading
 * says the kind of thing that happened and the message below it says the rest.
 */
function errorHeading(status: AppErrorStatus, i18n: Translator): string {
  switch (status) {
    case 401:
      return i18n.t("Please log in");
    case 403:
      return i18n.t("Not allowed");
    case 404:
      return i18n.t("Page not found");
    case 413:
      return i18n.t("Too large");
    case 429:
      return i18n.t("Too many requests");
    default:
      return i18n.t("Something went wrong");
  }
}

/**
 * Kevin Klement's parallel edition of the Tractatus, which sets the German
 * beside both English translations, so a reader in either language lands on
 * the line they just read. Each proposition is an anchor, `#p` and its number.
 */
const TRACTATUS = "https://people.umass.edu/klement/tlp/tlp.html";

/**
 * A line of the Tractatus, attributed by a footnote mark rather than a byline:
 * the lines are famous enough that naming their author reads as pedantry, and
 * the mark, numbered as the proposition is, says where each comes from to
 * anyone who wants to know.
 */
const Proposition: FC<{
  readonly line: string;
  /** The proposition's number, which is also the footnote mark. */
  readonly number: string;
  /** What the mark says to a screen reader and in its tooltip. */
  readonly source: string;
}> = ({ line, number, source }) => {
  const href = `${TRACTATUS}#p${number}`;

  return (
    <blockquote cite={href} class="status-page-epigraph">
      <p>
        {line}
        <sup class="status-page-note">
          <a aria-label={source} href={href} title={source}>
            {number}
          </a>
        </sup>
      </p>
    </blockquote>
  );
};

/**
 * The line a status page opens with, where it has one. The 404 and 403 are
 * dead ends, and a line about limits suits both. The 500 is our fault, so its
 * line is a joke at our own expense: a system that has proved a contradiction
 * is a system that has broken. The rest stay plain — a 401 is a sign-in the
 * reader is about to do, a 413 or 429 a nuisance to fix and retry.
 */
function statusEpigraph(status: AppErrorStatus, i18n: Translator): Child {
  switch (status) {
    case 403:
      return (
        <Proposition
          line={i18n.t(
            "The limits of my language mean the limits of my world.",
            undefined,
            {
              comment:
                "The 403 page's epigraph: Wittgenstein, Tractatus " +
                "Logico-Philosophicus, proposition 5.6. Use the published " +
                "translation in your language; German has the original, " +
                '"Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt."',
            },
          )}
          number="5.6"
          source={i18n.t(
            "Wittgenstein, Tractatus Logico-Philosophicus, proposition 5.6",
            undefined,
            {
              comment:
                "Names the source of the 403 page's epigraph, for the " +
                "footnote mark that links to it. The title is the book's own " +
                "and stays in Latin.",
            },
          )}
        />
      );
    case 404:
      return (
        <Proposition
          line={i18n.t(
            "Whereof one cannot speak, thereof one must be silent.",
            undefined,
            {
              comment:
                "The 404 page's epigraph: Wittgenstein, Tractatus " +
                "Logico-Philosophicus, proposition 7. Use the published " +
                "translation in your language; German has the original, " +
                '"Wovon man nicht sprechen kann, darüber muss man schweigen."',
            },
          )}
          number="7"
          source={i18n.t(
            "Wittgenstein, Tractatus Logico-Philosophicus, proposition 7",
            undefined,
            {
              comment:
                "Names the source of the 404 page's epigraph, for the " +
                "footnote mark that links to it. The title is the book's own " +
                "and stays in Latin.",
            },
          )}
        />
      );
    case 500:
      return (
        <p class="status-page-epigraph">
          {/* An image to a screen reader, which would otherwise spell the
              turnstile out glyph by glyph; the label says what it shows. */}
          <span
            aria-label={i18n.t("A proof that 0 = 1", undefined, {
              comment:
                "Read aloud in place of the formula ⊢ 0 = 1 on the server " +
                "error page: the server has proved a contradiction.",
            })}
            class="status-page-formula"
            role="img"
          >
            ⊢ 0 = 1
          </span>
        </p>
      );
    default:
      return null;
  }
}

/**
 * The generic HTML error page, rendered by the global error and not-found
 * handlers when the request came from a browser. Without it a mistyped URL, an
 * expired link, or an unhandled failure answers a reader with the raw JSON
 * envelope meant for API clients.
 *
 * It always offers somewhere to go next, because the reader arrived here by
 * following a link that did not work and the browser's back button returns them
 * to the same dead end.
 */
export function renderErrorPage(
  context: Context<AppBindings>,
  options: {
    readonly message: string;
    readonly status: AppErrorStatus;
  },
): Response {
  const i18n = context.get("i18n");
  const signedIn = context.get("actor") !== null;
  const heading = errorHeading(options.status, i18n);
  const next = (
    <a href={signedIn ? "/courses" : "/login"}>
      {signedIn
        ? i18n.t("Go to your courses")
        : i18n.t("Go to the login page")}
      {/* Outside the message, and hidden, the way every other onward link
          in the app carries its arrow: it is direction, not a word. */}
      <span aria-hidden="true"> →</span>
    </a>
  );

  const epigraph = statusEpigraph(options.status, i18n);

  if (epigraph !== null) {
    return renderShell(
      context,
      { status: options.status, title: heading },
      <div class="status-page">
        {/* The shell's hidden h1 already names the status in words; the
            numeral is the same fact drawn large, and read aloud it is only
            noise. */}
        <p aria-hidden="true" class="status-page-code">
          {options.status}
        </p>
        {epigraph}
        <p class="status-page-message">{options.message}</p>
        <p class="status-page-next">{next}</p>
        {options.status === 500 ? (
          // The one status where the reader has nothing to act on and support
          // does: the request id is what ties their report to a log line.
          <p class="small status-page-reference">
            {i18n.t("Reference: {requestId}", {
              requestId: context.get("requestId") ?? "unknown",
            })}
          </p>
        ) : null}
      </div>,
    );
  }

  return renderShell(
    context,
    { status: options.status, title: heading },
    <Sheet title={heading}>
      <ErrorSummary>{options.message}</ErrorSummary>
      <p class="error-next">{next}</p>
    </Sheet>,
  );
}
