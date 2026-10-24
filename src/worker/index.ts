import { createApp } from "./app";
import type { Env } from "./env";
import { createD1Stores } from "./infrastructure/database/d1";
import { runGradePassback } from "./passback";

/**
 * The client's address as Cloudflare's edge reports it. The edge sets the
 * header on every request and replaces any copy the client sent, which makes
 * it trustworthy here and nowhere else: off Cloudflare it is whatever the
 * client typed. Exported for the tests, which stand in for this host.
 */
export function cloudflareConnectingAddress(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

const app = createApp({ connectingAddress: cloudflareConnectingAddress });

export default {
  fetch: app.fetch,
  // Sweeps the grade-passback outbox: jobs the post-request kick could not
  // deliver (LMS outage, dead worker) are retried here on their backoff
  // schedule.
  async scheduled(controller, env, _executionContext) {
    if (env.DB === undefined) {
      return;
    }

    await runGradePassback(
      env,
      createD1Stores(env.DB),
      `cron-${controller.scheduledTime}`,
    );
  },
} satisfies ExportedHandler<Env>;
