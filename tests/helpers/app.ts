import { type CreateAppOptions, createApp } from "../../src/worker/app";
import type { Env } from "../../src/worker/env";
import type { WorkerApp } from "../../src/worker/http";
import { cloudflareConnectingAddress } from "../../src/worker/index";

const TEST_ENV: Env = { CARNAP_ENV: "local" };

/**
 * The app as the Worker builds it, so a test's `CF-Connecting-IP` is the
 * client's address; a test of another host passes its own
 * `connectingAddress`.
 */
export function createTestApp(options: CreateAppOptions = {}): WorkerApp {
  return createApp({
    connectingAddress: cloudflareConnectingAddress,
    ...options,
  });
}

export async function appRequest(
  app: WorkerApp,
  path: string,
  init?: RequestInit,
  env: Env = TEST_ENV,
): Promise<Response> {
  return app.request(path, init, env);
}
