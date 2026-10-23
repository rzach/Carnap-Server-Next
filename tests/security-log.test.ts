import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  spyOn,
  test,
} from "bun:test";

import { LOGIN_RATE_LIMIT_PER_EMAIL } from "../src/worker/application/login-rate-limit";
import type { Env } from "../src/worker/env";
import { logEvent } from "../src/worker/log";
import {
  bootstrapRequest,
  bootstrapTestAdmin,
  TEST_BOOTSTRAP_TOKEN,
} from "./helpers/admin";
import { appRequest, createTestApp } from "./helpers/app";
import {
  ACCEPT_JSON,
  authHeaders,
  createCourse,
  jsonRequest,
  type LoginResult,
  login,
  withStorage,
} from "./helpers/http";
import {
  createLtiTestApp,
  INSTRUCTOR_ROLE,
  performLaunch,
  registerTestPlatform,
  TEST_ISSUER,
} from "./helpers/lti";

setDefaultTimeout(30_000);

/**
 * What an institution's log collector receives: one JSON object per line,
 * audit events mirrored from the audit table, every sign-in and the refusals
 * worth an alert, each naming the account it concerns. Every console method is captured, so a line written any other way
 * would show up here as unparseable.
 */

type Line = Record<string, unknown>;

let lines: Line[] = [];
let spies: { mockRestore(): void }[] = [];

beforeEach(() => {
  lines = [];
  spies = (["log", "info", "warn", "error"] as const).map((method) =>
    spyOn(console, method).mockImplementation((...args: unknown[]) => {
      expect(args).toHaveLength(1);
      lines.push(JSON.parse(String(args[0])) as Line);
    }),
  );
});

afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
});

function events(name: string): Line[] {
  return lines.filter((line) => line.event === name);
}

/** The cookie values in a `Cookie` header: the session and CSRF tokens. */
function secretsIn(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((pair) => pair.split("=")[1]?.trim() ?? "")
    .filter((value) => value.length > 0);
}

/** A browser form post, signed in as `session` when given. */
function formPost(
  env: Env,
  path: string,
  fields: Record<string, string>,
  session?: LoginResult,
): Promise<Response> {
  return appRequest(
    createTestApp(),
    path,
    {
      body: new URLSearchParams(fields),
      headers: {
        Accept: "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
        ...(session === undefined
          ? {}
          : {
              Cookie: session.cookieHeader,
              "X-CSRF-Token": session.csrfToken,
            }),
      },
      method: "POST",
    },
    env,
  );
}

async function auditActions(env: Env, admin: LoginResult): Promise<Line[]> {
  const response = await appRequest(
    createTestApp(),
    "/admin/audit",
    { headers: { ...authHeaders(admin), ...ACCEPT_JSON } },
    env,
  );

  return ((await response.json()) as { events: Line[] }).events;
}

describe("structured logs", () => {
  test("a log line is one JSON object with time, level and event", () => {
    logEvent("warn", "example_event", { count: 2, skipped: undefined });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      count: 2,
      event: "example_event",
      level: "warn",
    });
    expect(lines[0]).not.toHaveProperty("skipped");
    expect(Number.isNaN(Date.parse(String(lines[0]?.time)))).toBe(false);
  });

  test("every audit row is also an audit line", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await login(env, "admin@example.test");

      await bootstrapTestAdmin(env, admin);

      const [audit] = events("audit");

      expect(audit).toMatchObject({
        action: "admin.bootstrap_site_admin",
        actorUserId: admin.actorId,
        level: "info",
        targetUserId: admin.actorId,
      });
      expect(audit?.requestId).toBeString();
    });
  });

  test("a sign-in and a sign-out name the account, and no secret is written", async () => {
    await withStorage(async (_storage, env) => {
      const ada = await login(env, "ada@example.test");
      const out = await appRequest(
        createTestApp(),
        "/auth/logout",
        jsonRequest({}, ada),
        env,
      );

      expect(out.status).toBe(204);
      expect(events("sign_in")).toEqual([
        expect.objectContaining({
          email: "ada@example.test",
          level: "info",
          method: "email",
          userId: ada.actorId,
        }),
      ]);
      expect(events("sign_out")).toEqual([
        expect.objectContaining({ userId: ada.actorId }),
      ]);
      expect(events("sign_in")[0]?.requestId).toBeString();

      // The session and CSRF tokens unlock the account; neither is logged.
      for (const secret of [...secretsIn(ada.cookieHeader), ada.csrfToken]) {
        expect(JSON.stringify(lines)).not.toContain(secret);
      }
    });
  });

  test("a used login link, a forged CSRF token and a refused bootstrap are logged", async () => {
    await withStorage(async (_storage, env) => {
      const user = await login(env, "ada@example.test");
      const confirm = await appRequest(
        createTestApp(),
        "/auth/login/confirm",
        jsonRequest({ loginToken: "alt_not-a-real-token" }),
        env,
      );
      const forged = await appRequest(
        createTestApp(),
        "/auth/logout",
        {
          headers: { Cookie: user.cookieHeader, "X-CSRF-Token": "wrong" },
          method: "POST",
        },
        env,
      );
      const bootstrap = await bootstrapRequest(env, user, {
        bootstrapToken: "guess",
      });

      expect(confirm.status).toBe(401);
      expect(forged.status).toBe(403);
      expect(bootstrap.status).toBe(403);
      expect(events("sign_in_failed")).toEqual([
        expect.objectContaining({
          level: "warn",
          reason: "invalid_login_token",
          stage: "confirm",
        }),
      ]);
      expect(events("csrf_rejected")).toEqual([
        expect.objectContaining({
          path: "/auth/logout",
          userId: user.actorId,
        }),
      ]);
      expect(events("bootstrap_refused")).toEqual([
        expect.objectContaining({
          reason: "invalid_bootstrap_token",
          userId: user.actorId,
        }),
      ]);
      expect(JSON.stringify(lines)).not.toContain("alt_not-a-real-token");
      expect(JSON.stringify(lines)).not.toContain(TEST_BOOTSTRAP_TOKEN);
    });
  });

  test("a refused login request names the address, and its account when there is one", async () => {
    await withStorage(async (_storage, env) => {
      const target = await login(env, "target@example.test");
      const app = createTestApp();

      // The address throttle answers 429 once one mailbox has asked too often.
      for (const email of ["target@Example.TEST", "nobody@example.test"]) {
        for (
          let attempt = 0;
          attempt <= LOGIN_RATE_LIMIT_PER_EMAIL;
          attempt += 1
        ) {
          await appRequest(
            app,
            "/auth/login/start",
            jsonRequest({ email }),
            env,
          );
        }
      }

      const refused = events("sign_in_failed");

      expect(
        refused.find((line) => line.email === "target@example.test"),
      ).toMatchObject({
        reason: "login_rate_limited",
        stage: "request",
        userId: target.actorId,
      });

      const stranger = refused.find(
        (line) => line.email === "nobody@example.test",
      );

      expect(stranger).toMatchObject({ reason: "login_rate_limited" });
      expect(stranger).not.toHaveProperty("userId");
    });
  });

  test("a suspended account's sign-in is refused at the session, by name", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await login(env, "admin@example.test");
      const ada = await login(env, "ada@example.test");

      await bootstrapTestAdmin(env, admin);
      expect(
        (
          await appRequest(
            createTestApp(),
            `/admin/users/${ada.actorId}/suspend`,
            jsonRequest({}, admin, ACCEPT_JSON),
            env,
          )
        ).status,
      ).toBe(200);
      await expect(login(env, "ada@example.test")).rejects.toThrow();

      expect(events("sign_in_failed")).toEqual([
        expect.objectContaining({
          email: "ada@example.test",
          method: "email",
          reason: "disabled_user",
          stage: "session",
          userId: ada.actorId,
        }),
      ]);
    });
  });

  test("address changes are logged with both addresses, however they are made", async () => {
    await withStorage(async ({ stores }, env) => {
      const admin = await login(env, "admin@example.test");
      const ada = await login(env, "ada@old.example.test");

      await bootstrapTestAdmin(env, admin);

      const changed = await appRequest(
        createTestApp(),
        `/admin/users/${ada.actorId}/email`,
        jsonRequest({ email: "ada@new.example.test" }, admin),
        env,
      );

      expect(changed.status).toBe(200);
      expect(
        events("audit").find(
          (line) => line.action === "admin.change_user_email",
        ),
      ).toMatchObject({
        metadata: {
          from: "ada@old.example.test",
          to: "ada@new.example.test",
        },
        targetUserId: ada.actorId,
      });

      // The holder's own change, confirmed from the link the local page shows.
      const grace = await login(env, "grace@old.example.test");
      const requested = await formPost(
        env,
        "/profile/email",
        { email: "grace@new.example.test" },
        grace,
      );
      const token = /\/profile\/email\/confirm\?token=([^"&]+)/.exec(
        await requested.text(),
      )?.[1];

      expect(token).toBeDefined();
      expect(
        (
          await formPost(env, "/profile/email/confirm", {
            token: token ?? "",
          })
        ).status,
      ).toBe(303);
      expect(events("email_changed")).toEqual([
        expect.objectContaining({
          actorUserId: admin.actorId,
          by: "admin",
          from: "ada@old.example.test",
          to: "ada@new.example.test",
          userId: ada.actorId,
        }),
        expect.objectContaining({
          by: "user",
          from: "grace@old.example.test",
          to: "grace@new.example.test",
          userId: grace.actorId,
        }),
      ]);
      expect(events("sign_in").at(-1)).toMatchObject({
        email: "grace@new.example.test",
        method: "email_change",
        userId: grace.actorId,
      });
      await expect(
        stores.users.getById(grace.actorId),
      ).resolves.toMatchObject({ email: "grace@new.example.test" });
    });
  });

  test("an LMS launch's sign-in names the platform, and a refused launch names the LMS user", async () => {
    await withStorage(async ({ stores }, env) => {
      const app = await createLtiTestApp();

      await registerTestPlatform(stores);

      const launched = await performLaunch(app, env, {
        email: "ida@example.test",
        roles: [INSTRUCTOR_ROLE],
        sub: "lms-user-7",
      });
      const refused = await performLaunch(app, env, {
        deploymentId: "not-registered",
        sub: "lms-user-8",
      });

      expect(launched.response.status).toBe(303);
      expect(refused.response.status).toBe(400);
      expect(events("sign_in")).toEqual([
        expect.objectContaining({
          email: "ida@example.test",
          issuer: TEST_ISSUER,
          method: "lti",
          subject: "lms-user-7",
        }),
      ]);
      expect(events("lti_launch_failed")).toEqual([
        expect.objectContaining({
          code: "lti_deployment_unknown",
          issuer: TEST_ISSUER,
          subject: "lms-user-8",
        }),
      ]);
      expect(events("lti_launch_failed")[0]?.requestId).toBeString();
    });
  });

  test("an instructor's staff and status changes are audited", async () => {
    await withStorage(async (_storage, env) => {
      const owner = await login(env, "owner@example.test");
      const assistant = await login(env, "ta@example.test");
      const admin = await login(env, "admin@example.test");

      await bootstrapTestAdmin(env, admin);

      const courseId = await createCourse(env, owner);
      const addStaff = (role: string) =>
        appRequest(
          createTestApp(),
          `/courses/${courseId}/staff`,
          jsonRequest({ role, userId: assistant.actorId }, owner),
          env,
        );
      const added = await addStaff("teacher_assistant");
      const membership = (
        (await added.json()) as { membership: { id: string } }
      ).membership;

      await addStaff("instructor");

      const dropped = await appRequest(
        createTestApp(),
        `/courses/${courseId}/memberships/${membership.id}`,
        {
          body: JSON.stringify({ status: "dropped" }),
          headers: {
            ...authHeaders(owner),
            "Content-Type": "application/json",
          },
          method: "PATCH",
        },
        env,
      );

      expect(dropped.status).toBe(200);

      const course = (await auditActions(env, admin))
        .filter((event) => String(event.action).startsWith("course."))
        .map((event) => [event.action, event.metadata]);

      expect(course).toEqual([
        [
          "course.membership_status_changed",
          { from: "active", role: "instructor", to: "dropped" },
        ],
        [
          "course.membership_role_changed",
          { from: "teacher_assistant", to: "instructor" },
        ],
        ["course.staff_added", { role: "teacher_assistant" }],
      ]);
      expect(
        events("audit").filter((line) =>
          String(line.action).startsWith("course."),
        ),
      ).toHaveLength(3);
    });
  });
});
