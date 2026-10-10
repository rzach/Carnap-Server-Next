import type { Context } from "hono";

import type { AuthenticatedActor } from "../application/auth";
import type {
  EmailAuthority,
  ExternalIdentityProvider,
} from "../domain/users";
import type { AppBindings } from "../http";
import { LOCALE_NAMES, SELECTABLE_LOCALES } from "../i18n/locales";
import { splitAtValue, VALUE } from "../i18n/translator";
import type { SummaryItem } from "./components";
import {
  CsrfInput,
  ErrorSummary,
  ModalDialog,
  Notice,
  Sheet,
  SummaryStrip,
  TableScroll,
  Time,
} from "./components";
import { capabilityLabel, identityProviderLabel } from "./labels";
import { type PageStatus, renderShell, useI18n } from "./layout";

/** An external identity resolved for display: LTI ones carry the platform name. */
export interface ProfileIdentity {
  readonly id: string;
  readonly provider: ExternalIdentityProvider;
  readonly createdAt: string;
  /** The LMS platform's registered name; null for native identities. */
  readonly platformName: string | null;
}

/** What the profile shows about the account beyond the user row. */
export interface ProfileAccount {
  readonly email: EmailAuthority;
  readonly identities: readonly ProfileIdentity[];
}

/** Distinct labels, in first-seen order, joined for a summary value. */
function joinDistinct(labels: readonly string[]): string {
  return [...new Set(labels)].join(", ");
}

interface ProfileViewOptions {
  /** The new address to prefill after a refused change request. */
  readonly emailValue?: string;
  /** A validation message to surface when a save was rejected. */
  readonly error?: string;
  /**
   * The confirmation link itself, shown under `CARNAP_ENV=local` with no mail
   * configured, as the login page shows its link there.
   */
  readonly localEmailLink?: string;
  /**
   * The language to preselect, `""` for "follow my browser". As with
   * {@link nameValue}: the rejected input on error, the stored preference
   * otherwise.
   */
  readonly localeValue?: string;
  /** The name to prefill (the rejected input on error; otherwise the stored name). */
  readonly nameValue?: string;
  /** A confirmation banner, e.g. after a successful save. */
  readonly notice?: string;
  /** The response status: a refused action's, alongside its {@link error}. */
  readonly status?: PageStatus;
}

/**
 * The signed-in user's own account page: one form for everything a user controls
 * about themselves, the read-only facts about their account, and the single place
 * the log-out control lives. Future preferences (a theme, notification settings)
 * belong in that same form rather than beside it — one set of inputs and one Save
 * is what makes the page readable as "your settings" instead of a stack of
 * unrelated widgets.
 */
export function renderProfile(
  context: Context<AppBindings>,
  actor: AuthenticatedActor,
  account: ProfileAccount,
  options: ProfileViewOptions = {},
): Response {
  const i18n = context.get("i18n");
  const { user } = actor;
  const { identities } = account;
  const nameValue = options.nameValue ?? user.name ?? "";
  const localeValue = options.localeValue ?? user.locale ?? "";
  const lmsLinked = identities.some(
    (identity) => identity.provider === "lti",
  );

  const facts: SummaryItem[] = [];

  if (actor.capabilities.length > 0) {
    facts.push({
      label: i18n.t("Platform roles"),
      value: joinDistinct(
        actor.capabilities.map((grant) =>
          capabilityLabel(i18n, grant.capability),
        ),
      ),
    });
  }

  facts.push({
    label: i18n.t("Sign-in"),
    value: joinDistinct(
      identities.map((identity) =>
        identityProviderLabel(i18n, identity.provider),
      ),
    ),
  });

  facts.push({
    label: i18n.t("Member since"),
    value: <Time value={user.createdAt} />,
  });

  // A fact, not a field: this is the institution's identifier for the account
  // holder, asserted by their LMS, and neither a preference of theirs nor
  // something they should be able to invent. It is shown so that someone whose
  // grades are matched against a roster can see which number they are matched
  // by, and left out when absent rather than shown empty.
  if (user.studentId !== null) {
    facts.push({ label: i18n.t("Student ID"), value: user.studentId });
  }

  return renderShell(
    context,
    {
      title: i18n.t("Profile"),
      ...(options.status === undefined ? {} : { status: options.status }),
    },
    <>
      {/* Above the sheet rather than in it: a notice can answer any of its
          sections — a save, an address change, an unlinked LMS. */}
      {options.notice === undefined ? null : (
        <Notice>{options.notice}</Notice>
      )}
      {options.localEmailLink === undefined ? null : (
        <p class="token">
          <a href={options.localEmailLink}>
            {i18n.t("Continue with this local confirmation link")}
          </a>
        </p>
      )}
      {options.error === undefined ? null : (
        <ErrorSummary>{options.error}</ErrorSummary>
      )}
      <Sheet
        className="profile-sheet"
        description={i18n.t("Your account details and preferences.")}
        footer={
          <form action="/logout" class="logout-form" method="post">
            <CsrfInput context={context} />
            <button type="submit">{i18n.t("Log out")}</button>
          </form>
        }
        sections={[
          <ProfileForm
            context={context}
            localeValue={localeValue}
            nameValue={nameValue}
          />,
          <EmailSection
            context={context}
            email={account.email}
            emailValue={options.emailValue ?? ""}
            lmsLinked={lmsLinked}
            verified={user.emailVerifiedAt !== null}
          />,
          // Null rather than an element that renders nothing: the sheet can
          // only skip a section it can see is empty.
          lmsLinked ? (
            <LtiIdentities context={context} identities={identities} />
          ) : null,
        ]}
        summary={<SummaryStrip items={facts} />}
        title={i18n.t("Account")}
      />
    </>,
  );
}

/**
 * The part of the account its holder edits: one form, one Save. Headed
 * "Preferences" rather than by what it holds today, because anything else the
 * holder sets about themselves (a theme, notification settings) joins this form
 * rather than getting a section of its own.
 */
function ProfileForm({
  context,
  localeValue,
  nameValue,
}: {
  readonly context: Context<AppBindings>;
  readonly localeValue: string;
  readonly nameValue: string;
}) {
  const i18n = useI18n();

  return (
    <form
      action="/profile"
      aria-labelledby="profile-form-heading"
      method="post"
    >
      <h3 id="profile-form-heading">{i18n.t("Preferences")}</h3>
      <CsrfInput context={context} />
      <div class="field-grid wide-fields">
        <label>
          {i18n.t("Name")}
          <br />
          <input maxlength={200} name="name" value={nameValue} />
        </label>
        <label>
          {i18n.t("Language")}
          <br />
          <select name="locale">
            {/* The default, and the way back to it: with nothing recorded,
                Carnap follows the request — this browser's cookie, its
                `Accept-Language`, an LTI launch's platform locale. Saving a
                language pins it to the account instead, which is what makes it
                survive a new browser and reach an emailed login link. */}
            <option selected={localeValue === ""} value="">
              {i18n.t("Match my browser")}
            </option>
            {SELECTABLE_LOCALES.map((locale) => (
              <option selected={locale === localeValue} value={locale}>
                {/* An endonym, so a reader can find their own language even
                    when the page is written in one they cannot read. */}
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit">{i18n.t("Save changes")}</button>
    </form>
  );
}

/**
 * The account's address, as text rather than a read-only field, and who owns
 * it. Ownership is the subtle part — it decides whether the holder's next LMS
 * launch can change the address — so it is said outright rather than left for
 * the holder to infer from an address changing under them.
 *
 * Outside the profile form because it carries forms of its own. A placeholder
 * address is never shown: it reads as a mailbox, and Carnap cannot write to it.
 */
function EmailSection({
  context,
  email,
  emailValue,
  lmsLinked,
  verified,
}: {
  readonly context: Context<AppBindings>;
  readonly email: EmailAuthority;
  readonly emailValue: string;
  readonly lmsLinked: boolean;
  readonly verified: boolean;
}) {
  const i18n = useI18n();
  const source =
    email.email === null
      ? i18n.t("Your LMS hasn't shared one with Carnap.")
      : email.source === "lti"
        ? email.platformName === null
          ? i18n.t("From your LMS.")
          : i18n.t("From {platform}.", { platform: email.platformName })
        : email.source === "admin"
          ? lmsLinked
            ? i18n.t(
                "Set by an administrator. Launches from your LMS won't change it.",
              )
            : i18n.t("Set by an administrator.")
          : // An address its holder typed at sign-in needs no attribution until
            // an LMS could be thought to own it.
            lmsLinked
            ? i18n.t(
                "You set this address. Launches from your LMS won't change it.",
              )
            : null;

  return (
    <section aria-labelledby="profile-email-heading" class="profile-email">
      <h3 id="profile-email-heading">{i18n.t("Email")}</h3>
      {/* The address and the way to change it, on one line, as each LMS's
          offer below is: the form itself waits in a dialog, so the section
          stays a statement of where the address stands. */}
      <div class="profile-email-line">
        <p class="profile-email-address">
          {email.email ?? i18n.t("No email address yet")}
        </p>
        <button
          class="ghost"
          data-dialog-target={EMAIL_CHANGE_DIALOG_ID}
          type="button"
        >
          {email.email === null
            ? i18n.t("Add an address")
            : i18n.t("Change address")}
        </button>
      </div>
      {source === null ? null : <p class="small">{source}</p>}
      {email.email !== null && !verified ? (
        <p class="small">
          {i18n.t(
            "Not yet verified. Signing in by email once will verify it.",
          )}
        </p>
      ) : null}
      {email.alternatives.map((alternative) => {
        const [before, after] = splitAtValue(
          i18n.t("{platform} has a different address for you: {address}", {
            address: VALUE,
            platform: alternative.platformName ?? i18n.t("LMS (LTI)"),
          }),
        );

        return (
          <form
            action="/profile/email/lms"
            class="profile-email-line"
            method="post"
          >
            <CsrfInput context={context} />
            <input
              name="identityId"
              type="hidden"
              value={alternative.identityId}
            />
            <p class="small">
              {before}
              <strong>{alternative.email}</strong>
              {after}
            </p>
            <button class="ghost" type="submit">
              {i18n.t("Use that instead")}
            </button>
          </form>
        );
      })}
      <EmailChangeDialog
        context={context}
        lmsOwned={email.source === "lti" && email.email !== null}
        value={emailValue}
      />
    </section>
  );
}

const EMAIL_CHANGE_DIALOG_ID = "email-change-dialog";

/**
 * The request to move to a new address, which changes nothing until the link
 * it sends there is opened. Where the LMS owns the address, it says what the
 * change gives up: launches stop updating it.
 *
 * In a dialog, opened from beside the address: the section around it already
 * carries the address, its source, and any LMS's offer of another, and a
 * standing form under all that read as one more thing to fill in. A refused
 * request comes back with the page's error summary and the typed address
 * still in the field, one click away.
 */
function EmailChangeDialog({
  context,
  lmsOwned,
  value,
}: {
  readonly context: Context<AppBindings>;
  readonly lmsOwned: boolean;
  readonly value: string;
}) {
  const i18n = useI18n();

  return (
    <ModalDialog
      id={EMAIL_CHANGE_DIALOG_ID}
      title={i18n.t("Change email address")}
    >
      <form action="/profile/email" method="post">
        <CsrfInput context={context} />
        <label>
          {i18n.t("New email address")}
          <br />
          <input
            autocomplete="email"
            maxlength={254}
            name="email"
            required
            type="email"
            value={value}
          />
        </label>
        <p class="small">
          {lmsOwned
            ? i18n.t(
                "We'll send a link to the new address, and change nothing until it is opened. After that, launches from your LMS won't change your address.",
              )
            : i18n.t(
                "We'll send a link to the new address, and change nothing until it is opened.",
              )}
        </p>
        <div class="sheet-actions">
          <button type="submit">{i18n.t("Send link")}</button>
        </div>
      </form>
    </ModalDialog>
  );
}

/**
 * The LMS identities attached to this account, each removable: if a launch
 * linked an LMS user the account owner does not recognize, this is where
 * they undo it. A relaunch from that LMS goes back through link approval.
 */
function LtiIdentities({
  context,
  identities,
}: {
  readonly context: Context<AppBindings>;
  readonly identities: readonly ProfileIdentity[];
}) {
  const i18n = useI18n();
  const ltiIdentities = identities.filter(
    (identity) => identity.provider === "lti",
  );

  if (ltiIdentities.length === 0) {
    return null;
  }

  return (
    <>
      <h3>{i18n.t("Linked LMS access")}</h3>
      <TableScroll>
        <thead>
          <tr>
            <th>{i18n.t("LMS")}</th>
            <th>{i18n.t("Linked")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ltiIdentities.map((identity) => (
            <tr>
              <td>{identity.platformName ?? i18n.t("LMS (LTI)")}</td>
              <td>
                <Time value={identity.createdAt} />
              </td>
              <td>
                <form action="/profile/identities/remove" method="post">
                  <CsrfInput context={context} />
                  <input
                    name="identityId"
                    type="hidden"
                    value={identity.id}
                  />
                  <button class="danger" type="submit">
                    {i18n.t("Remove")}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </TableScroll>
    </>
  );
}
