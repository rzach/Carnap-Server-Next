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
import { bootstrapRequest, bootstrapTestAdmin } from "./helpers/admin";
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

setDefaultTimeout(30_000);

/**
 * What an institution's log collector receives: one JSON object per line,
 * audit events mirrored from the audit table, and the refusals worth an
 * alert. Every console method is captured, so a line written any other way
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
      // Neither the token tried nor the address belongs in a log.
      expect(JSON.stringify(lines)).not.toContain("alt_not-a-real-token");
      expect(JSON.stringify(lines)).not.toContain("ada@example.test");
    });
  });

  test("a refused login request names the address's domain, not the address", async () => {
    await withStorage(async (_storage, env) => {
      const app = createTestApp();

      // The address throttle answers 429 once one mailbox has asked too often.
      for (
        let attempt = 0;
        attempt <= LOGIN_RATE_LIMIT_PER_EMAIL;
        attempt += 1
      ) {
        await appRequest(
          app,
          "/auth/login/start",
          jsonRequest({ email: "target@Example.TEST" }),
          env,
        );
      }

      const refused = events("sign_in_failed");

      expect(refused.length).toBeGreaterThan(0);
      expect(refused[0]).toMatchObject({
        emailDomain: "example.test",
        reason: "login_rate_limited",
        stage: "request",
      });
      expect(JSON.stringify(lines)).not.toContain("target@");
    });
  });

  test("an admin's email change logs the domains, and keeps the addresses in the audit table", async () => {
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
          fromDomain: "old.example.test",
          toDomain: "new.example.test",
        },
        targetUserId: ada.actorId,
      });
      expect(JSON.stringify(lines)).not.toContain("ada@");

      const [row] = await stores.adminAudit.listRecent(1);

      expect(row?.metadata).toEqual({
        from: "ada@old.example.test",
        to: "ada@new.example.test",
      });
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
