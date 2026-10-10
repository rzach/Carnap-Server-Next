import { describe, expect, setDefaultTimeout, test } from "bun:test";

import type { AppStores } from "../src/worker/application/stores";
import { withStorage } from "./helpers/http";

setDefaultTimeout(30_000);

const MIGRATION_PATH =
  "src/worker/infrastructure/database/migrations/0033_email_source.sql";

const NOW = "2026-10-10T00:00:00.000Z";

/**
 * The backfill in migration 0033, run again over seeded rows.
 *
 * Every test database starts empty, so the migration that runs during setup
 * matches nothing. Only the final statement is run: the column additions
 * before it cannot run twice, and the backfill is the part with a rule in it.
 */
async function runBackfill(db: D1Database): Promise<void> {
  const statements = (await Bun.file(MIGRATION_PATH).text()).split(
    "--> statement-breakpoint",
  );

  await db.prepare(statements.at(-1) ?? "").run();
}

async function createPlatform(stores: AppStores, id: string): Promise<void> {
  await stores.lti.createPlatform({
    authorizationEndpoint: `https://${id}.example.test/auth`,
    clientId: id,
    createdAt: NOW,
    id,
    issuer: `https://${id}.example.test`,
    jwksUri: `https://${id}.example.test/jwks`,
    name: id,
    tokenEndpoint: `https://${id}.example.test/token`,
  });
}

describe("the email source backfill", () => {
  test("hands an address to the LMS that most recently linked, and every other to its holder", async () => {
    await withStorage(async ({ db, stores }) => {
      await createPlatform(stores, "platform-old");
      await createPlatform(stores, "platform-new");

      for (const [id, email] of [
        ["user-lti", "lti@example.test"],
        ["user-native", "native@example.test"],
        ["user-bare", "bare@example.test"],
      ] as const) {
        await stores.users.create({ createdAt: NOW, email, id, name: null });
      }

      await stores.users.createExternalIdentity({
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "identity-old",
        provider: "lti",
        providerSubject: "platform-old:sub-1",
        userId: "user-lti",
      });
      await stores.users.createExternalIdentity({
        createdAt: "2026-02-01T00:00:00.000Z",
        id: "identity-new",
        provider: "lti",
        providerSubject: "platform-new:sub-1",
        userId: "user-lti",
      });
      await stores.users.createExternalIdentity({
        createdAt: NOW,
        id: "identity-native",
        provider: "native",
        providerSubject: "native@example.test",
        userId: "user-native",
      });

      await runBackfill(db);

      await expect(stores.users.getById("user-lti")).resolves.toMatchObject({
        emailSource: "lti",
        emailSourcePlatformId: "platform-new",
      });

      for (const id of ["user-native", "user-bare"]) {
        await expect(stores.users.getById(id)).resolves.toMatchObject({
          emailSource: "user",
          emailSourcePlatformId: null,
        });
      }
    });
  });
});
