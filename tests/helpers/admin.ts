import { expect } from "bun:test";

import type { PlatformCapability } from "../../src/worker/domain/admin";
import type { Env } from "../../src/worker/env";
import { appRequest, createTestApp } from "./app";
import { ACCEPT_JSON, jsonRequest, type LoginResult } from "./http";

/** The bootstrap secret the tests configure; bootstrap refuses without one. */
export const TEST_BOOTSTRAP_TOKEN = "test-bootstrap-token";

/** Post to `/admin/bootstrap` as `login`, on an env with the token set. */
export function bootstrapRequest(
  env: Env,
  login: LoginResult,
  body: unknown,
  overrides: Partial<Env> = { ADMIN_BOOTSTRAP_TOKEN: TEST_BOOTSTRAP_TOKEN },
): Promise<Response> {
  return appRequest(
    createTestApp(),
    "/admin/bootstrap",
    jsonRequest(body, login, ACCEPT_JSON),
    { ...env, ...overrides },
  );
}

/** Make `admin` the site administrator, the way an operator does. */
export async function bootstrapTestAdmin(
  env: Env,
  admin: LoginResult,
): Promise<void> {
  const response = await bootstrapRequest(env, admin, {
    bootstrapToken: TEST_BOOTSTRAP_TOKEN,
  });

  expect(response.status).toBe(201);
}

export async function grantTestCapability(
  env: Env,
  userId: string,
  capability: PlatformCapability,
): Promise<void> {
  const now = new Date().toISOString();
  const id = `test_${capability}_${Date.now()}_${Math.random()}`;
  // Optional on `Env` since a self-hosted server binds no D1; every test that
  // reaches here built its env from `createTestStorage`, so it is present.
  const db = env.DB;

  if (db === undefined) {
    throw new Error("grantTestCapability needs a D1 binding.");
  }

  await db
    .prepare(
      `INSERT INTO platform_capability_grants (
      id,
      user_id,
      capability,
      granted_by_id,
      granted_at,
      revoked_at
    ) VALUES (?, ?, ?, NULL, ?, NULL)`,
    )
    .bind(id, userId, capability, now)
    .run();
}

export async function grantTestCourseCreator(
  env: Env,
  userId: string,
): Promise<void> {
  return grantTestCapability(env, userId, "course_creator");
}

export async function grantTestContentAuthor(
  env: Env,
  userId: string,
): Promise<void> {
  return grantTestCapability(env, userId, "content_author");
}
