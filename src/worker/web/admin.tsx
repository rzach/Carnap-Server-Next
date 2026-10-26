import type { Context } from "hono";
import type { FC } from "hono/jsx";
import { bootstrapConfigured } from "../application/admin";
import type { UserDirectory } from "../application/users";
import type {
  AdminAuditEvent,
  AdminGlobalStats,
  AdminUserProfile,
  PlatformCapabilityGrant,
} from "../domain/admin";
import type { Course } from "../domain/courses";
import type { JsonValue } from "../domain/json";
import {
  NATIVE_REGISTRATION_MODES,
  type SiteSettings,
} from "../domain/site-settings";
import type { EmailAuthority, User } from "../domain/users";
import type { AppBindings } from "../http";
import { splitAtValue, type Translator, VALUE } from "../i18n/translator";
import { adminCrumb } from "./breadcrumbs";
import {
  BarField,
  ChoiceNotes,
  CreateBar,
  CsrfInput,
  LinkStrip,
  Notice,
  Sheet,
  StatusBadge,
  SummaryStrip,
  TableScroll,
  Time,
} from "./components";
import {
  auditActionLabel,
  capabilityLabel,
  capabilityOptions,
  courseRoleOptions,
  identityProviderLabel,
  membershipStatusOptions,
  nativeRegistrationHint,
  nativeRegistrationLabel,
  type SelectOption,
} from "./labels";
import { renderShell, useI18n } from "./layout";
import { userDisplayName } from "./users";

const SelectOptions: FC<{
  readonly options: readonly SelectOption[];
  readonly selected: string;
}> = ({ options, selected }) => (
  <>
    {options.map((option) => (
      <option selected={option.value === selected} value={option.value}>
        {option.label}
      </option>
    ))}
  </>
);

/**
 * A suspended account, flagged beside its email. Every other account is
 * active, and a column saying so on each row buried the one it was there for.
 */
const UserStatusBadge: FC<{ readonly user: User }> = ({ user }) => {
  const i18n = useI18n();

  return user.disabledAt === null ? null : (
    <>
      {" "}
      <StatusBadge label={i18n.t("Suspended")} tone="danger" />
    </>
  );
};

const StatsSummary: FC<{ readonly stats: AdminGlobalStats }> = ({
  stats,
}) => {
  const i18n = useI18n();

  return (
    <SummaryStrip
      items={[
        { label: i18n.t("Users"), value: stats.users.toString() },
        {
          label: i18n.t("Active courses"),
          value: stats.activeCourses.toString(),
        },
        { label: i18n.t("Assignments"), value: stats.assignments.toString() },
        { label: i18n.t("Submissions"), value: stats.submissions.toString() },
        {
          label: i18n.t("Manual grading work"),
          value: stats.gradingWork.toString(),
        },
      ]}
    />
  );
};

const SearchForm: FC<{ readonly query?: string }> = ({ query }) => {
  const i18n = useI18n();

  return (
    // A bar like the create bars, though it posts nothing: one field and the
    // button that acts on it, on one line.
    <form action="/admin/users" class="create-bar" method="get">
      <BarField label={i18n.t("Find user")}>
        <input name="query" type="search" value={query ?? ""} />
      </BarField>
      <button class="secondary" type="submit">
        {i18n.t("Search")}
      </button>
    </form>
  );
};

const UsersTable: FC<{ readonly users: readonly User[] }> = ({ users }) => {
  const i18n = useI18n();

  if (users.length === 0) {
    return <p>{i18n.t("No users matched.")}</p>;
  }

  return (
    // Name first, as everywhere a person is listed; the address and the
    // account's age are columns of their own on a wide screen, where one
    // column left the sheet mostly empty, and the line under the name on a
    // phone.
    <TableScroll phoneList="flat">
      <thead>
        <tr>
          <th>{i18n.t("Name")}</th>
          <th>{i18n.t("Email")}</th>
          <th>{i18n.t("Member since")}</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr>
            <td>
              <a href={`/admin/users/${user.id}`}>
                {userDisplayName(i18n, user, user.id)}
              </a>
              <UserStatusBadge user={user} />
            </td>
            <td>{user.email}</td>
            {/* A column to compare rows by, not something to read on a
                phone, where it pushed the line under the name onto two. */}
            <td class="wide-only">
              <Time value={user.createdAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
};

const CapabilityGrantBar: FC<{
  readonly context: Context<AppBindings>;
  readonly userId: string;
}> = ({ context, userId }) => {
  const i18n = useI18n();

  return (
    <CreateBar
      action={`/admin/users/${userId}/capabilities`}
      context={context}
      submitLabel={i18n.t("Grant capability")}
    >
      <BarField label={i18n.t("Capability")}>
        <select name="capability" required>
          <SelectOptions
            options={capabilityOptions(i18n)}
            selected="content_author"
          />
        </select>
      </BarField>
    </CreateBar>
  );
};

const CapabilitiesTable: FC<{
  readonly context: Context<AppBindings>;
  readonly grants: readonly PlatformCapabilityGrant[];
}> = ({ context, grants }) => {
  const i18n = useI18n();

  if (grants.length === 0) {
    return <p class="small">{i18n.t("No active platform capabilities.")}</p>;
  }

  return (
    <TableScroll>
      <thead>
        <tr>
          <th>{i18n.t("Capability")}</th>
          <th>{i18n.t("Granted")}</th>
          <th>{i18n.t("Actions")}</th>
        </tr>
      </thead>
      <tbody>
        {grants.map((grant) => (
          <tr>
            <td>{capabilityLabel(i18n, grant.capability)}</td>
            <td>
              <Time value={grant.grantedAt} />
            </td>
            <td>
              <form
                action={`/admin/users/${grant.userId}/capabilities/revoke`}
                method="post"
              >
                <CsrfInput context={context} />
                <input
                  name="capability"
                  type="hidden"
                  value={grant.capability}
                />
                <button class="danger" type="submit">
                  {i18n.t("Revoke")}
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
};

/**
 * The account's state, with the one control that changes it on the same
 * line: in the record's body, as the profile's email line is, and not in the
 * sheet's header, which no other sheet gives a button.
 */
const AccountSection: FC<{
  readonly context: Context<AppBindings>;
  readonly profile: AdminUserProfile;
}> = ({ context, profile }) => {
  const i18n = useI18n();
  const suspending = profile.user.disabledAt === null;

  return (
    <section aria-labelledby="record-account-heading" class="record-section">
      <h3 id="record-account-heading">{i18n.t("Account")}</h3>
      <div class="record-line">
        <p>{suspending ? i18n.t("Active") : i18n.t("Suspended")}</p>
        <form
          action={`/admin/users/${profile.user.id}/${
            suspending ? "suspend" : "reactivate"
          }`}
          method="post"
        >
          <CsrfInput context={context} />
          <button class={suspending ? "danger" : "secondary"} type="submit">
            {suspending ? i18n.t("Suspend user") : i18n.t("Reactivate user")}
          </button>
        </form>
      </div>
    </section>
  );
};

/**
 * Move the account to a new address: the way back in for someone who lost
 * the old mailbox. A footer bar like the sheets' others; the change takes
 * effect at once, and the old address is told.
 */
const AdminEmailBar: FC<{
  readonly context: Context<AppBindings>;
  readonly userId: string;
}> = ({ context, userId }) => {
  const i18n = useI18n();

  return (
    <CreateBar
      action={`/admin/users/${userId}/email`}
      context={context}
      submitLabel={i18n.t("Change email address")}
    >
      <BarField label={i18n.t("New email address")}>
        <input
          maxlength={254}
          name="email"
          placeholder={i18n.t("person@example.edu", undefined, {
            comment:
              "Example address in an email field. Translate the local " +
              "part; the example.edu domain is reserved for documentation.",
          })}
          required
          type="email"
        />
      </BarField>
    </CreateBar>
  );
};

const IdentitiesTable: FC<{ readonly profile: AdminUserProfile }> = ({
  profile,
}) => {
  const i18n = useI18n();

  if (profile.identities.length === 0) {
    return <p class="small">{i18n.t("No external identities.")}</p>;
  }

  return (
    <TableScroll phoneList="flat">
      <thead>
        <tr>
          <th>{i18n.t("Provider")}</th>
          <th>{i18n.t("Subject")}</th>
          <th>{i18n.t("Address it last sent")}</th>
        </tr>
      </thead>
      <tbody>
        {profile.identities.map((identity) => (
          <tr>
            <td>{identityProviderLabel(i18n, identity.provider)}</td>
            <td>{identity.providerSubject}</td>
            {/* What the platform says, adopted or not: where it differs from
                the account's address, this is the column that shows why. A
                native identity's subject already is its address. */}
            <td>{identity.assertedEmail ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
};

/** Who owns an account's address, as the line under it in the record says. */
function emailSourceLine(i18n: Translator, email: EmailAuthority): string {
  switch (email.source) {
    case "lti":
      return i18n.t("Set by {platform}", {
        platform: email.platformName ?? i18n.t("LMS (LTI)"),
      });
    case "user":
      return i18n.t("Set by the user");
    case "admin":
      return i18n.t("Set by an administrator");
  }
}

/** "Verified <date>", split so the date element lands where the translator put it. */
const VerifiedAt: FC<{ readonly at: string }> = ({ at }) => {
  const i18n = useI18n();
  const [before, after] = splitAtValue(
    i18n.t("Verified {when}", { when: VALUE }),
  );

  return (
    <>
      {before}
      <Time value={at} />
      {after}
    </>
  );
};

const MembershipRepairForm: FC<{
  readonly context: Context<AppBindings>;
  readonly entry: AdminUserProfile["courses"][number];
  readonly userId: string;
}> = ({ context, entry, userId }) => {
  const i18n = useI18n();

  return (
    <form action="/admin/memberships" class="create-bar" method="post">
      <CsrfInput context={context} />
      <input name="courseId" type="hidden" value={entry.course.id} />
      <input name="userId" type="hidden" value={userId} />
      <select aria-label={i18n.t("Role")} name="role" required>
        <SelectOptions
          options={courseRoleOptions(i18n)}
          selected={entry.membership.role}
        />
      </select>
      <select aria-label={i18n.t("Status")} name="status" required>
        <SelectOptions
          options={membershipStatusOptions(i18n)}
          selected={entry.membership.status}
        />
      </select>
      <button class="secondary" type="submit">
        {i18n.t("Save")}
      </button>
    </form>
  );
};

const ProfileCoursesTable: FC<{
  readonly context: Context<AppBindings>;
  readonly profile: AdminUserProfile;
}> = ({ context, profile }) => {
  const i18n = useI18n();

  if (profile.courses.length === 0) {
    return <p class="small">{i18n.t("No course memberships.")}</p>;
  }

  return (
    <TableScroll>
      <thead>
        <tr>
          <th>{i18n.t("Course")}</th>
          <th>{i18n.t("Role & status")}</th>
        </tr>
      </thead>
      <tbody>
        {profile.courses.map((entry) => (
          <tr>
            <td>
              <a href={`/courses/${entry.course.id}`}>{entry.course.title}</a>
            </td>
            <td>
              <MembershipRepairForm
                context={context}
                entry={entry}
                userId={profile.user.id}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
};

const MembershipCreateBar: FC<{
  readonly context: Context<AppBindings>;
  readonly courses: readonly Course[];
  readonly userId: string;
}> = ({ context, courses, userId }) => {
  const i18n = useI18n();

  if (courses.length === 0) {
    return <p class="small">{i18n.t("No courses exist yet.")}</p>;
  }

  return (
    <CreateBar
      action="/admin/memberships"
      context={context}
      submitLabel={i18n.t("Add membership")}
    >
      <input name="userId" type="hidden" value={userId} />
      <BarField label={i18n.t("Course")}>
        <select name="courseId" required>
          {courses.map((course) => (
            <option value={course.id}>{course.title}</option>
          ))}
        </select>
      </BarField>
      <BarField label={i18n.t("Role")}>
        <select name="role" required>
          <SelectOptions
            options={courseRoleOptions(i18n)}
            selected="student"
          />
        </select>
      </BarField>
      <BarField label={i18n.t("Status")}>
        <select name="status" required>
          <SelectOptions
            options={membershipStatusOptions(i18n)}
            selected="active"
          />
        </select>
      </BarField>
    </CreateBar>
  );
};

/**
 * The names an audit table reads its ids by: the actors and target users, and
 * the target courses' titles. A course that has since gone (or never resolved)
 * is simply absent, and the row falls back to its id.
 */
export interface AuditDirectory {
  readonly courseTitles: ReadonlyMap<string, string>;
  readonly users: UserDirectory;
}

const AuditTargets: FC<{
  readonly directory: AuditDirectory;
  readonly event: AdminAuditEvent;
}> = ({ directory, event }) => {
  const i18n = useI18n();
  const courseTitle =
    event.targetCourseId === null
      ? undefined
      : directory.courseTitles.get(event.targetCourseId);

  return (
    <>
      {event.targetUserId !== null ? (
        <a href={`/admin/users/${event.targetUserId}`}>
          {userDisplayName(
            i18n,
            directory.users.get(event.targetUserId) ?? null,
            event.targetUserId,
          )}
        </a>
      ) : null}
      {event.targetUserId !== null && event.targetCourseId !== null
        ? " · "
        : null}
      {event.targetCourseId !== null ? (
        <a href={`/courses/${event.targetCourseId}`}>
          {courseTitle ??
            i18n.t("course {courseId}", { courseId: event.targetCourseId })}
        </a>
      ) : null}
    </>
  );
};

/**
 * Whether an event's metadata is worth a disclosure to open. Several actions
 * record `{}` — a suspension's whole story is its action and its target — and a
 * triangle that opens onto an empty object is worse than no triangle.
 */
function hasMetadata(metadata: JsonValue): boolean {
  if (metadata === null) {
    return false;
  }

  if (typeof metadata === "object") {
    return Object.keys(metadata).length > 0;
  }

  return true;
}

/**
 * The support half of an event, on its own full-width line under the row: the
 * request id, and the metadata behind a disclosure when there is any. Both are
 * load-bearing — a request id is what you grep the logs with — but as columns
 * they made every row as tall as its JSON and pushed the four fields the table
 * exists to be read by off the side of the sheet.
 */
const AuditDetail: FC<{ readonly event: AdminAuditEvent }> = ({ event }) => {
  const i18n = useI18n();
  // The id rides along inside the summary rather than behind it: it names the
  // disclosure (a page of these would otherwise be a page of identical
  // "Metadata" buttons) and support can read it without opening anything.
  const request = (
    <>
      {i18n.t("Request")} <code>{event.requestId}</code>
    </>
  );

  if (!hasMetadata(event.metadata)) {
    return <p class="audit-request">{request}</p>;
  }

  return (
    <details class="audit-request">
      <summary>{request}</summary>
      <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
    </details>
  );
};

/**
 * An action in words, with its code underneath: the words are what an admin
 * scans the log by, and the code is what they search the logs and the source
 * for. A code with no words is shown alone, as it is.
 */
const AuditAction: FC<{ readonly action: string }> = ({ action }) => {
  const i18n = useI18n();
  const label = auditActionLabel(i18n, action);

  if (label === null) {
    return <code>{action}</code>;
  }

  return (
    <>
      {label}
      <code class="audit-action-code">{action}</code>
    </>
  );
};

const AuditTable: FC<{
  readonly directory: AuditDirectory;
  readonly events: readonly AdminAuditEvent[];
}> = ({ directory, events }) => {
  const i18n = useI18n();

  if (events.length === 0) {
    return <p class="small">{i18n.t("No admin audit events yet.")}</p>;
  }

  return (
    <TableScroll>
      <thead>
        <tr>
          <th>{i18n.t("Time")}</th>
          <th>{i18n.t("Action")}</th>
          <th>{i18n.t("Actor")}</th>
          <th>{i18n.t("Targets")}</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <>
            <tr class="audit-event">
              <td>
                <Time value={event.createdAt} />
              </td>
              <td>
                <AuditAction action={event.action} />
              </td>
              <td>
                <a href={`/admin/users/${event.actorUserId}`}>
                  {userDisplayName(
                    i18n,
                    directory.users.get(event.actorUserId) ?? null,
                    event.actorUserId,
                  )}
                </a>
              </td>
              <td>
                <AuditTargets directory={directory} event={event} />
              </td>
            </tr>
            {/* One event is two rows, and the rule belongs after the pair —
                see the .audit-event rules in chrome.css. */}
            <tr class="audit-event-detail">
              <td colspan={4}>
                <AuditDetail event={event} />
              </td>
            </tr>
          </>
        ))}
      </tbody>
    </TableScroll>
  );
};

/**
 * Who may create an account by email sign-in. Only a site administrator gets
 * the form; a support operator sees the setting, since it explains why
 * someone's sign-in was refused, but cannot change it.
 */
const RegistrationSheet: FC<{
  readonly canChange: boolean;
  readonly context: Context<AppBindings>;
  readonly settings: SiteSettings;
}> = ({ canChange, context, settings }) => {
  const i18n = useI18n();
  const current = settings.nativeRegistration;

  return (
    <Sheet
      description={i18n.t(
        "Who can create an account by signing in with an email link. Existing accounts can always sign in by email, and LMS launches always create accounts.",
      )}
      title={i18n.t("Account registration")}
    >
      {canChange ? (
        // One setting and the button that saves it, on one line like the
        // user search above; the note under the bar says what the choice does.
        <form action="/admin/settings/registration" method="post">
          <CsrfInput context={context} />
          <div class="create-bar">
            <BarField label={i18n.t("New accounts by email")}>
              <select data-choice-notes="nativeRegistration" name="mode">
                {NATIVE_REGISTRATION_MODES.map((mode) => (
                  <option selected={mode === current} value={mode}>
                    {nativeRegistrationLabel(i18n, mode)}
                  </option>
                ))}
              </select>
            </BarField>
            <button class="secondary" type="submit">
              {i18n.t("Save")}
            </button>
          </div>
          <ChoiceNotes
            group="nativeRegistration"
            notes={NATIVE_REGISTRATION_MODES.map((mode) => ({
              note: nativeRegistrationHint(i18n, mode),
              value: mode,
            }))}
            selected={current}
          />
        </form>
      ) : (
        <>
          <p>
            {i18n.t("New accounts by email: {setting}", {
              setting: nativeRegistrationLabel(i18n, current),
            })}
          </p>
          <p class="small">{nativeRegistrationHint(i18n, current)}</p>
        </>
      )}
    </Sheet>
  );
};

export function renderAdminDashboard(
  context: Context<AppBindings>,
  model: {
    readonly auditEvents: readonly AdminAuditEvent[];
    readonly canChangeSettings: boolean;
    readonly directory: AuditDirectory;
    readonly saved: boolean;
    readonly settings: SiteSettings;
    readonly stats: AdminGlobalStats;
  },
): Response {
  const i18n = context.get("i18n");

  return renderShell(
    context,
    { title: i18n.t("Platform administration") },
    <>
      {model.saved ? <Notice>{i18n.t("Change saved.")}</Notice> : null}
      <Sheet
        description={i18n.t("Operational counts for the local installation.")}
        summary={<StatsSummary stats={model.stats} />}
        title={i18n.t("Platform summary")}
      >
        {/* The admin's other destinations hang off the counts they explain,
            rather than each taking a sheet whose whole body is one link. */}
        <LinkStrip
          links={[
            {
              hint: i18n.t(
                "Register the LMS platforms and deployments that launch into Carnap",
              ),
              href: "/admin/lti",
              label: i18n.t("LTI platforms"),
            },
            {
              hint: i18n.t("Every administrative action, with request IDs"),
              href: "/admin/audit",
              label: i18n.t("Audit log"),
            },
            ...(model.canChangeSettings
              ? [
                  {
                    hint: i18n.t(
                      "What this instance says about itself, such as an Impressum or privacy notice",
                    ),
                    href: "/admin/about",
                    label: i18n.t("About page"),
                  },
                ]
              : []),
          ]}
        />
      </Sheet>
      <Sheet
        description={i18n.t(
          "Find users by email or name before changing platform state.",
        )}
        title={i18n.t("User search")}
      >
        <SearchForm />
      </Sheet>
      <RegistrationSheet
        canChange={model.canChangeSettings}
        context={context}
        settings={model.settings}
      />
      <Sheet
        description={i18n.t(
          "Recent administrative actions with request IDs.",
        )}
        title={i18n.t("Recent audit activity")}
      >
        <AuditTable directory={model.directory} events={model.auditEvents} />
      </Sheet>
    </>,
  );
}

export function renderAdminUsers(
  context: Context<AppBindings>,
  model: { readonly query: string; readonly users: readonly User[] },
): Response {
  const i18n = context.get("i18n");

  return renderShell(
    context,
    { breadcrumb: [adminCrumb(i18n)], title: i18n.t("User search") },
    <>
      <Sheet title={i18n.t("Search")}>
        <SearchForm query={model.query} />
      </Sheet>
      <Sheet title={i18n.t("Results")}>
        <UsersTable users={model.users} />
      </Sheet>
    </>,
  );
}

export function renderAdminUserProfile(
  context: Context<AppBindings>,
  model: {
    readonly courses: readonly Course[];
    readonly profile: AdminUserProfile;
    readonly saved: boolean;
  },
): Response {
  const i18n = context.get("i18n");
  const { profile } = model;

  return renderShell(
    context,
    {
      breadcrumb: [
        adminCrumb(i18n),
        { href: "/admin/users", label: i18n.t("Users") },
      ],
      title: profile.user.name ?? profile.user.email,
    },
    <>
      {model.saved ? <Notice>{i18n.t("Change saved.")}</Notice> : null}
      {/* Sections of plain text, as the profile is, rather than a strip of
          display tiles: an address and "Set by the user" are words, and in
          the strip's large serif the address broke at its hyphen even on a
          wide screen. */}
      <Sheet
        footer={
          <CapabilityGrantBar context={context} userId={profile.user.id} />
        }
        sections={[
          // The short facts share a row where there is room for one, as the
          // strip of tiles did, and stack on a phone.
          <div class="record-facts">
            <section
              aria-labelledby="record-email-heading"
              class="record-section"
            >
              <h3 id="record-email-heading">{i18n.t("Email")}</h3>
              <p class="record-email-address">
                {profile.email.email ?? i18n.t("No email address yet")}
              </p>
              <p class="small">
                {emailSourceLine(i18n, profile.email)} ·{" "}
                {profile.user.emailVerifiedAt === null ? (
                  i18n.t("Unverified")
                ) : (
                  <VerifiedAt at={profile.user.emailVerifiedAt} />
                )}
              </p>
            </section>
            {/* Omitted rather than shown empty: an admin looking at a record
                needs to know an LMS asserted an ID and what it was, and a
                blank on the majority of accounts that have none would only
                add a line. */}
            {profile.user.studentId === null ? null : (
              <section
                aria-labelledby="record-student-id-heading"
                class="record-section"
              >
                <h3 id="record-student-id-heading">{i18n.t("Student ID")}</h3>
                <p>{profile.user.studentId}</p>
              </section>
            )}
            <AccountSection context={context} profile={profile} />
          </div>,
          <>
            <h3>{i18n.t("Platform capabilities")}</h3>
            <CapabilitiesTable
              context={context}
              grants={profile.capabilities}
            />
          </>,
        ]}
        title={i18n.t("User record")}
      />
      {/* The address change sits with the sign-ins, which it changes: the
          native one keyed on the old address goes with it. */}
      <Sheet
        footer={<AdminEmailBar context={context} userId={profile.user.id} />}
        title={i18n.t("Identities")}
      >
        <IdentitiesTable profile={profile} />
      </Sheet>
      <Sheet
        footer={
          <MembershipCreateBar
            context={context}
            courses={model.courses}
            userId={profile.user.id}
          />
        }
        title={i18n.t("Course memberships")}
      >
        <ProfileCoursesTable context={context} profile={profile} />
      </Sheet>
    </>,
  );
}

export function renderAdminAudit(
  context: Context<AppBindings>,
  events: readonly AdminAuditEvent[],
  directory: AuditDirectory,
): Response {
  const i18n = context.get("i18n");

  return renderShell(
    context,
    { breadcrumb: [adminCrumb(i18n)], title: i18n.t("Admin audit log") },
    <Sheet
      description={i18n.t("The most recent administrative audit events.")}
      title={i18n.t("Audit events")}
    >
      <AuditTable directory={directory} events={events} />
    </Sheet>,
  );
}

export function renderBootstrap(context: Context<AppBindings>): Response {
  const i18n = context.get("i18n");
  const title = i18n.t("Bootstrap site administrator");

  return renderShell(
    context,
    { title },
    <Sheet title={title}>
      {bootstrapConfigured(context.env.ADMIN_BOOTSTRAP_TOKEN) ? (
        <>
          <p>
            {i18n.t(
              "If no site administrator exists, you can bootstrap this account with the server's bootstrap token.",
            )}
          </p>
          <form action="/admin/bootstrap" method="post">
            <CsrfInput context={context} />
            <label>
              {i18n.t("Bootstrap token")}
              <br />
              <input
                autocomplete="off"
                name="bootstrapToken"
                type="password"
              />
            </label>
            <button type="submit">{title}</button>
          </form>
        </>
      ) : (
        <p>
          {i18n.t(
            "Administrator bootstrap is not configured on this server. Set ADMIN_BOOTSTRAP_TOKEN and restart it.",
          )}
        </p>
      )}
    </Sheet>,
  );
}
