import type { Context } from "hono";

import type {
  PendingEmailChange,
  PendingEmailUndo,
} from "../application/email-change";
import type { AppBindings } from "../http";
import { ErrorSummary, Sheet } from "./components";
import { type PageStatus, renderShell } from "./layout";

/**
 * The pages behind an address change's emailed links. Each GET only says what
 * its button will do: mail scanners open links, and opening one must not change
 * anything. No CSRF field, because the routes take the link's token as their
 * proof instead (see `CSRF_EXEMPT_PATHS`).
 */

export function renderEmailChangeConfirm(
  context: Context<AppBindings>,
  model: PendingEmailChange & { readonly token: string },
): Response {
  const i18n = context.get("i18n");
  const title = i18n.t("Confirm new email address");

  return renderShell(
    context,
    { title },
    <Sheet title={title}>
      <p>
        {model.fromEmail === null
          ? i18n.t("Give your Carnap account the address {new}?", {
              new: model.toEmail,
            })
          : i18n.t(
              "Change the email address of the Carnap account that uses {old} to {new}?",
              { new: model.toEmail, old: model.fromEmail },
            )}
      </p>
      <p class="small">
        {i18n.t(
          "From then on, sign in with the new address. If you did not ask for this, close this page and nothing will change.",
        )}
      </p>
      <form action="/profile/email/confirm" method="post">
        <input name="token" type="hidden" value={model.token} />
        <button type="submit">{i18n.t("Use this address")}</button>
      </form>
    </Sheet>,
  );
}

export function renderEmailUndo(
  context: Context<AppBindings>,
  model: PendingEmailUndo & { readonly token: string },
): Response {
  const i18n = context.get("i18n");
  const title = i18n.t("Undo email change");

  return renderShell(
    context,
    { title },
    <Sheet title={title}>
      <p>
        {i18n.t(
          "The email address of the Carnap account that used {old} was changed to {new}.",
          { new: model.currentEmail, old: model.restoreEmail },
        )}
      </p>
      <p class="small">
        {i18n.t(
          "Undoing the change puts {old} back, signs you in, and signs the account out everywhere else. If you made the change yourself, there is nothing to do: sign in with {new} instead.",
          { new: model.currentEmail, old: model.restoreEmail },
        )}
      </p>
      <form action="/profile/email/undo" method="post">
        <input name="token" type="hidden" value={model.token} />
        <button type="submit">{i18n.t("Put my old address back")}</button>
      </form>
    </Sheet>,
  );
}

/**
 * A link that cannot be used — expired, used, or refused — with the reason.
 * The way on is signing in, which every one of these readers can still do.
 */
export function renderEmailLinkFailure(
  context: Context<AppBindings>,
  model: { readonly message: string; readonly status: PageStatus },
): Response {
  const i18n = context.get("i18n");
  const title = i18n.t("This link can't be used");

  return renderShell(
    context,
    { status: model.status, title },
    <Sheet
      footer={<a href="/login">{i18n.t("Go to sign-in")}</a>}
      title={title}
    >
      <ErrorSummary>{model.message}</ErrorSummary>
    </Sheet>,
  );
}
