import { describe, expect, setDefaultTimeout, test } from "bun:test";

import type { Env } from "../src/worker/env";
import {
  bootstrapRequest,
  bootstrapTestAdmin,
  grantTestCourseCreator,
  TEST_BOOTSTRAP_TOKEN,
} from "./helpers/admin";
import { appRequest, createTestApp } from "./helpers/app";
import {
  ACCEPT_JSON,
  authHeaders,
  jsonRequest,
  type LoginResult,
  login,
  withStorage,
} from "./helpers/http";

setDefaultTimeout(30_000);

interface CapabilityResponse {
  readonly capability: {
    readonly capability: string;
    readonly userId: string;
  };
}

interface AuditResponse {
  readonly events: readonly {
    readonly action: string;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly targetUserId: string | null;
  }[];
}

interface ErrorResponse {
  readonly error: {
    readonly code: string;
  };
}

/** Signed in and asking for JSON: the admin routes answer HTML otherwise. */
function adminHeaders(login: LoginResult): Record<string, string> {
  return { ...authHeaders(login), ...ACCEPT_JSON };
}

async function grantCapability(
  env: Env,
  admin: LoginResult,
  userId: string,
  capability: string,
): Promise<CapabilityResponse> {
  const response = await appRequest(
    createTestApp(),
    `/admin/users/${userId}/capabilities`,
    jsonRequest({ capability }, admin, ACCEPT_JSON),
    env,
  );
  const body = (await response.json()) as CapabilityResponse;

  expect(response.status).toBe(201);

  return body;
}

describe("platform administration", () => {
  test("course instructor status does not grant platform admin", async () => {
    await withStorage(async (_storage, env) => {
      const instructor = await login(env, "instructor@example.test");

      await grantTestCourseCreator(env, instructor.actorId);

      const courseResponse = await appRequest(
        createTestApp(),
        "/courses",
        jsonRequest(
          { title: "Logic", timezone: "UTC" },
          instructor,
          ACCEPT_JSON,
        ),
        env,
      );
      const response = await appRequest(
        createTestApp(),
        "/admin/users?query=instructor",
        { headers: adminHeaders(instructor) },
        env,
      );
      const body = (await response.json()) as ErrorResponse;

      expect(courseResponse.status).toBe(201);
      expect(response.status).toBe(403);
      expect(body.error.code).toBe("platform_capability_required");
    });
  });

  test("bootstrap refuses when no token is configured", async () => {
    await withStorage(async (_storage, env) => {
      const user = await login(env, "first@example.test");

      for (const overrides of [{}, { ADMIN_BOOTSTRAP_TOKEN: "" }]) {
        const response = await bootstrapRequest(
          env,
          user,
          { bootstrapToken: "" },
          overrides,
        );
        const body = (await response.json()) as ErrorResponse;

        expect(response.status).toBe(403);
        expect(body.error.code).toBe("bootstrap_not_configured");
      }

      const page = await appRequest(
        createTestApp(),
        "/admin/bootstrap",
        { headers: authHeaders(user) },
        env,
      );
      const html = await page.text();

      expect(page.status).toBe(200);
      expect(html).toContain("not configured on this server");
      expect(html).not.toContain('name="bootstrapToken"');
    });
  });

  test("bootstrap needs the token, and only works once", async () => {
    await withStorage(async (_storage, env) => {
      const first = await login(env, "first@example.test");
      const second = await login(env, "second@example.test");
      const wrong = await bootstrapRequest(env, first, {
        bootstrapToken: "not-the-token",
      });
      const missing = await bootstrapRequest(env, first, {});

      expect(wrong.status).toBe(403);
      expect(((await wrong.json()) as ErrorResponse).error.code).toBe(
        "invalid_bootstrap_token",
      );
      expect(missing.status).toBe(403);

      await bootstrapTestAdmin(env, first);

      const again = await bootstrapRequest(env, second, {
        bootstrapToken: TEST_BOOTSTRAP_TOKEN,
      });

      expect(again.status).toBe(403);
      expect(((await again.json()) as ErrorResponse).error.code).toBe(
        "site_admin_already_bootstrapped",
      );
    });
  });

  test("a site admin can grant and revoke course creator", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await login(env, "admin@example.test");
      const target = await login(env, "teacher@example.test");

      await bootstrapTestAdmin(env, admin);

      const granted = await grantCapability(
        env,
        admin,
        target.actorId,
        "course_creator",
      );
      const revokeResponse = await appRequest(
        createTestApp(),
        `/admin/users/${target.actorId}/capabilities/revoke`,
        jsonRequest({ capability: "course_creator" }, admin, ACCEPT_JSON),
        env,
      );
      const auditResponse = await appRequest(
        createTestApp(),
        "/admin/audit",
        { headers: adminHeaders(admin) },
        env,
      );
      const audit = (await auditResponse.json()) as AuditResponse;

      expect(granted.capability.capability).toBe("course_creator");
      expect(granted.capability.userId).toBe(target.actorId);
      expect(revokeResponse.status).toBe(200);
      expect(audit.events.map((event) => event.action)).toContain(
        "admin.grant_platform_capability",
      );
      expect(audit.events.map((event) => event.action)).toContain(
        "admin.revoke_platform_capability",
      );
    });
  });

  test("a support operator cannot grant site admin", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await login(env, "admin@example.test");
      const support = await login(env, "support@example.test");
      const target = await login(env, "target@example.test");

      await bootstrapTestAdmin(env, admin);
      await grantCapability(env, admin, support.actorId, "support_operator");

      const denied = await appRequest(
        createTestApp(),
        `/admin/users/${target.actorId}/capabilities`,
        jsonRequest({ capability: "site_admin" }, support, ACCEPT_JSON),
        env,
      );
      const auditResponse = await appRequest(
        createTestApp(),
        "/admin/audit",
        { headers: adminHeaders(admin) },
        env,
      );
      const audit = (await auditResponse.json()) as AuditResponse;

      expect(denied.status).toBe(403);
      expect(
        audit.events.filter(
          (event) =>
            event.action === "admin.grant_platform_capability" &&
            event.targetUserId === target.actorId,
        ),
      ).toHaveLength(0);
    });
  });

  test("suspension rejects existing sessions and future login", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await login(env, "admin@example.test");
      const target = await login(env, "blocked@example.test");

      await bootstrapTestAdmin(env, admin);

      const suspendResponse = await appRequest(
        createTestApp(),
        `/admin/users/${target.actorId}/suspend`,
        jsonRequest({}, admin, ACCEPT_JSON),
        env,
      );
      const meResponse = await appRequest(
        createTestApp(),
        "/auth/me",
        { headers: adminHeaders(target) },
        env,
      );
      const startResponse = await appRequest(
        createTestApp(),
        "/auth/login/start",
        jsonRequest({ email: "blocked@example.test" }),
        env,
      );
      const startBody = (await startResponse.json()) as {
        login: { loginToken: string };
      };
      const confirmResponse = await appRequest(
        createTestApp(),
        "/auth/login/confirm",
        jsonRequest({ loginToken: startBody.login.loginToken }),
        env,
      );

      expect(suspendResponse.status).toBe(200);
      expect(meResponse.status).toBe(403);
      expect(startResponse.status).toBe(202);
      expect(confirmResponse.status).toBe(403);

      // The user list has no status column: an active account goes unsaid,
      // and a suspended one is badged beside its email.
      const listResponse = await appRequest(
        createTestApp(),
        "/admin/users?query=example.test",
        { headers: { ...authHeaders(admin), Accept: "text/html" } },
        env,
      );
      const list = await listResponse.text();

      expect(listResponse.status).toBe(200);
      expect(list).not.toContain("<th>Status</th>");
      expect(list).toContain(
        `<a href="/admin/users/${target.actorId}">blocked@example.test</a> ` +
          '<span class="status-badge status-badge-danger">Suspended</span>',
      );
      expect(list).toContain(
        `<a href="/admin/users/${admin.actorId}">admin@example.test</a></td>`,
      );
      expect(list.match(/<span class="status-badge/g)?.length).toBe(1);
    });
  });

  test("support membership changes are audited", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await login(env, "admin@example.test");
      const user = await login(env, "student@example.test");
      const instructor = await login(env, "instructor@example.test");

      await bootstrapTestAdmin(env, admin);
      await grantTestCourseCreator(env, instructor.actorId);

      const courseResponse = await appRequest(
        createTestApp(),
        "/courses",
        jsonRequest(
          { title: "Logic", timezone: "UTC" },
          instructor,
          ACCEPT_JSON,
        ),
        env,
      );
      const courseBody = (await courseResponse.json()) as {
        readonly course: { readonly id: string };
      };
      const membershipResponse = await appRequest(
        createTestApp(),
        "/admin/memberships",
        jsonRequest(
          {
            courseId: courseBody.course.id,
            role: "student",
            status: "active",
            userId: user.actorId,
          },
          admin,
          ACCEPT_JSON,
        ),
        env,
      );
      const auditResponse = await appRequest(
        createTestApp(),
        "/admin/audit",
        { headers: adminHeaders(admin) },
        env,
      );
      const audit = (await auditResponse.json()) as AuditResponse;

      expect(courseResponse.status).toBe(201);
      expect(membershipResponse.status).toBe(200);
      expect(audit.events.map((event) => event.action)).toContain(
        "admin.change_course_membership",
      );

      // The page says what happened in words, keeps the code under them, and
      // names the course by its title rather than its id.
      const pageResponse = await appRequest(
        createTestApp(),
        "/admin/audit",
        { headers: { ...authHeaders(admin), Accept: "text/html" } },
        env,
      );
      const page = await pageResponse.text();

      expect(pageResponse.status).toBe(200);
      expect(page).toContain(
        'Course membership changed<code class="audit-action-code">' +
          "admin.change_course_membership</code>",
      );
      expect(page).toContain(
        `student@example.test</a> · <a href="/courses/${courseBody.course.id}">Logic</a>`,
      );
    });
  });
});
