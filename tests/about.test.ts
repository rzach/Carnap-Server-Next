import { describe, expect, setDefaultTimeout, test } from "bun:test";

import type { Env } from "../src/worker/env";
import { bootstrapTestAdmin, grantTestCapability } from "./helpers/admin";
import { appRequest, createTestApp } from "./helpers/app";
import {
  ACCEPT_JSON,
  jsonRequest,
  type LoginResult,
  login,
  withStorage,
} from "./helpers/http";

setDefaultTimeout(30_000);

/**
 * `/about`: what every instance says about Carnap, and the text an instance's
 * administrator adds above it — an Impressum, a privacy notice — which has to
 * be readable without an account (gh #29).
 */

const COMMIT = "21c6dfc0a1b2c3d4e5f60718293a4b5c6d7e8f90";

function aboutForm(admin: LoginResult, source: string): RequestInit {
  return {
    body: new URLSearchParams({ csrfToken: admin.csrfToken, source }),
    headers: {
      Accept: "text/html",
      Cookie: admin.cookieHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  };
}

async function signedOutAbout(env: Env): Promise<string> {
  const response = await appRequest(
    createTestApp(),
    "/about",
    { headers: { Accept: "text/html" } },
    env,
  );

  expect(response.status).toBe(200);

  return response.text();
}

async function siteAdmin(env: Env): Promise<LoginResult> {
  const admin = await login(env, "admin@example.test");

  await bootstrapTestAdmin(env, admin);

  return admin;
}

describe("about page", () => {
  test("anyone can read it, and it links the source and the running commit", async () => {
    await withStorage(
      async (_storage, env) => {
        const html = await signedOutAbout(env);

        expect(html).toContain(
          'href="https://github.com/gleachkr/Carnap-Server-Next"',
        );
        expect(html).toContain(
          `href="https://github.com/gleachkr/Carnap-Server-Next/commit/${COMMIT}"`,
        );
        expect(html).toContain("<code>21c6dfc</code>");
        // The way there is on every page with a footer.
        expect(html).toContain('class="footer-link" href="/about"');
      },
      { CARNAP_COMMIT: COMMIT },
    );
  });

  test("names no commit when none is configured, or the variable is not a hash", async () => {
    await withStorage(async (_storage, env) => {
      expect(await signedOutAbout(env)).not.toContain("/commit/");
    });
    await withStorage(
      async (_storage, env) => {
        expect(await signedOutAbout(env)).not.toContain("/commit/");
      },
      { CARNAP_COMMIT: "main; echo" },
    );
  });

  test("an administrator's text is compiled on save and shown above it, signed out", async () => {
    await withStorage(async (storage, env) => {
      const admin = await siteAdmin(env);
      const saved = await appRequest(
        createTestApp(),
        "/admin/about",
        aboutForm(
          admin,
          "## Impressum\n\nRun by the *Logic Lab*, $p \\to q$.",
        ),
        env,
      );

      expect(saved.status).toBe(303);
      expect(saved.headers.get("Location")).toBe("/admin/about?saved=1");

      const html = await signedOutAbout(env);

      expect(html).toContain("<h2>Impressum</h2>");
      expect(html).toContain("<em>Logic Lab</em>");
      expect(html).toContain("<math");
      expect(html.indexOf("Impressum")).toBeLessThan(
        html.indexOf("Carnap-Server-Next"),
      );

      const audit = await storage.stores.adminAudit.listRecent(10);

      expect(
        audit.filter((event) => event.action === "admin.change_about_page"),
      ).toHaveLength(1);
    });
  });

  test("source that will not compile comes back with its diagnostics, kept, and saves nothing", async () => {
    await withStorage(async (storage, env) => {
      const admin = await siteAdmin(env);
      const source =
        'Contact us.\n\n:::multiple-choice{id="q1"}\nPick one.\n:::\n\n<b>bold</b>';
      const refused = await appRequest(
        createTestApp(),
        "/admin/about",
        aboutForm(admin, source),
        env,
      );
      const html = await refused.text();

      expect(refused.status).toBe(200);
      expect(html).toContain("<code>unsupported_directive</code>");
      expect(html).toContain("<code>unsafe_raw_html</code>");
      expect(html).toContain("Contact us.");
      expect((await storage.stores.siteSettings.read()).about).toBeNull();
    });
  });

  test("a style block or an exercise is refused once, whatever is inside it", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await siteAdmin(env);
      const response = await appRequest(
        createTestApp(),
        "/admin/about",
        jsonRequest(
          {
            // The exercise is malformed too (one option, no key), which the
            // page has no use for hearing about: the block goes either way.
            source:
              'Hello.\n\n:::style\np { color: red; }\n:::\n\n:::multiple-choice{id="q1"}\nPick.\n:::\n\n:::note\nAside.\n:::',
          },
          admin,
          ACCEPT_JSON,
        ),
        env,
      );
      const body = (await response.json()) as {
        readonly diagnostics: readonly {
          readonly code: string;
          readonly line: number;
        }[];
      };

      expect(response.status).toBe(400);
      expect(
        body.diagnostics.map(({ code, line }) => ({ code, line })),
      ).toEqual([
        { code: "unsupported_directive", line: 3 },
        { code: "unsupported_directive", line: 7 },
        { code: "unsupported_directive", line: 11 },
      ]);
    });
  });

  test("a blank save clears the text, and saving the same text twice is one change", async () => {
    await withStorage(async (storage, env) => {
      const admin = await siteAdmin(env);
      const save = (source: string) =>
        appRequest(
          createTestApp(),
          "/admin/about",
          jsonRequest({ source }, admin, ACCEPT_JSON),
          env,
        );

      expect((await save("Hosted by us.")).status).toBe(200);
      expect((await save("Hosted by us.\n")).status).toBe(200);
      expect(await signedOutAbout(env)).toContain("Hosted by us.");

      expect((await save("   ")).status).toBe(200);
      expect(await signedOutAbout(env)).not.toContain("Hosted by us.");

      const audit = await storage.stores.adminAudit.listRecent(10);

      expect(
        audit
          .filter((event) => event.action === "admin.change_about_page")
          .map((event) => event.metadata),
      ).toEqual([{ cleared: true }, { cleared: false }]);
    });
  });

  test("only a site administrator may read or change the editor", async () => {
    await withStorage(async (_storage, env) => {
      await siteAdmin(env);
      const support = await login(env, "support@example.test");

      await grantTestCapability(env, support.actorId, "support_operator");

      const editor = await appRequest(
        createTestApp(),
        "/admin/about",
        {
          headers: {
            Accept: "application/json",
            Cookie: support.cookieHeader,
          },
        },
        env,
      );
      const change = await appRequest(
        createTestApp(),
        "/admin/about",
        jsonRequest({ source: "Mine now." }, support, ACCEPT_JSON),
        env,
      );

      expect(editor.status).toBe(403);
      expect(change.status).toBe(403);
      expect(await signedOutAbout(env)).not.toContain("Mine now.");
    });
  });

  test("the editor shows the stored source back, under the admin crumb", async () => {
    await withStorage(async (_storage, env) => {
      const admin = await siteAdmin(env);

      await appRequest(
        createTestApp(),
        "/admin/about",
        aboutForm(admin, "Questions: write to the department."),
        env,
      );

      const editor = await appRequest(
        createTestApp(),
        "/admin/about?saved=1",
        { headers: { Accept: "text/html", Cookie: admin.cookieHeader } },
        env,
      );
      const html = await editor.text();

      expect(editor.status).toBe(200);
      expect(html).toContain(
        "Questions: write to the department.</textarea>",
      );
      expect(html).toContain('href="/admin"');
      expect(html).toContain("Change saved.");
      // The lesson editor's bundle, told to compile this as chrome prose.
      expect(html).toContain('data-source-format="prose"');
      expect(html).toContain('id="prose-source-label"');
      expect(html).toContain("data-editor-diagnostics");
      expect(html).toContain('src="/assets/editor-preview.js"');
    });
  });
});
