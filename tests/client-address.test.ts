import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { LOGIN_RATE_LIMIT_PER_IP } from "../src/worker/application/login-rate-limit";
import type { Env } from "../src/worker/env";
import { clientIpAddress, type WorkerApp } from "../src/worker/http";
import { appRequest, createTestApp } from "./helpers/app";
import { jsonRequest, withStorage } from "./helpers/http";

setDefaultTimeout(30_000);

const LOCAL: Env = { CARNAP_ENV: "local" };
const PROXIED: Env = { CARNAP_ENV: "local", CARNAP_TRUST_PROXY: "1" };

/** The Bun server's case: the socket's peer, which no header can change. */
const SOCKET_PEER = "198.51.100.9";

const SPOOFED = {
  "CF-Connecting-IP": "203.0.113.1",
  "X-Forwarded-For": "203.0.113.2, 203.0.113.3",
};

function appWithProbe(
  connectingAddress?: (request: Request) => string | null,
): WorkerApp {
  return createTestApp({
    configure: (app) => {
      app.get("/test/ip", (context) =>
        context.json({ ip: clientIpAddress(context) }),
      );
    },
    ...(connectingAddress === undefined ? {} : { connectingAddress }),
  });
}

async function probe(
  app: WorkerApp,
  headers: Record<string, string>,
  env: Env = LOCAL,
): Promise<string | null> {
  const response = await appRequest(app, "/test/ip", { headers }, env);

  return ((await response.json()) as { ip: string | null }).ip;
}

describe("the client address", () => {
  test("on Cloudflare it is the edge's CF-Connecting-IP, never X-Forwarded-For", async () => {
    const app = appWithProbe();

    expect(await probe(app, SPOOFED)).toBe("203.0.113.1");
    expect(
      await probe(app, { "X-Forwarded-For": SPOOFED["X-Forwarded-For"] }),
    ).toBeNull();
  });

  test("off Cloudflare and without a trusted proxy, both headers are ignored", async () => {
    const app = appWithProbe(() => SOCKET_PEER);

    expect(await probe(app, SPOOFED)).toBe(SOCKET_PEER);
    expect(await probe(app, {})).toBe(SOCKET_PEER);
  });

  test("behind a trusted proxy it is the entry the proxy added, not the client's", async () => {
    const app = appWithProbe(() => SOCKET_PEER);

    expect(await probe(app, SPOOFED, PROXIED)).toBe("203.0.113.3");
    expect(
      await probe(app, { "X-Forwarded-For": " 203.0.113.4 " }, PROXIED),
    ).toBe("203.0.113.4");
  });

  test("a trusted proxy that sent no address leaves none, rather than its own", async () => {
    const app = appWithProbe(() => SOCKET_PEER);

    expect(await probe(app, {}, PROXIED)).toBeNull();
    expect(await probe(app, { "X-Forwarded-For": "" }, PROXIED)).toBeNull();
  });
});

describe("the login throttle off Cloudflare", () => {
  test("a fresh spoofed header per request does not buy a fresh budget", async () => {
    await withStorage(async (_storage, env) => {
      const app = createTestApp({ connectingAddress: () => SOCKET_PEER });
      const statuses: number[] = [];

      for (
        let attempt = 0;
        attempt < LOGIN_RATE_LIMIT_PER_IP + 1;
        attempt++
      ) {
        const request = jsonRequest({
          email: `student${attempt}@example.test`,
        });
        const response = await appRequest(
          app,
          "/auth/login/start",
          {
            ...request,
            headers: {
              ...(request.headers as Record<string, string>),
              "CF-Connecting-IP": `203.0.113.${attempt}`,
              "X-Forwarded-For": `192.0.2.${attempt}`,
            },
          },
          env,
        );

        statuses.push(response.status);
      }

      expect(statuses.at(-2)).toBe(202);
      expect(statuses.at(-1)).toBe(429);
    });
  });
});
