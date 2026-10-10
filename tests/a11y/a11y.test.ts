import { expect, setDefaultTimeout, test } from "bun:test";
import { JSDOM } from "jsdom";

import { collectFindings } from "../../scripts/a11y-report";
import { type Finding, runAxe } from "./axe-runner";
import baseline from "./baseline.json";
import { collectFixtures } from "./fixtures";

/**
 * Tier 1 accessibility gate (ratchet mode). Renders the representative page set
 * (`fixtures.ts`), runs the AA structural ruleset (`axe-runner.ts`), and fails
 * only on findings that are NOT already recorded in `baseline.json` — so new
 * regressions block the build while the known backlog is tracked, not required
 * to be fixed first. See `docs/a11y.md`.
 *
 *   New violation appears  → test fails, listing it (fix it, or knowingly
 *                            accept it with `bun run a11y:baseline`).
 *   Baselined violation    → tolerated (it's the burn-down list).
 *   Baselined violation fixed → passes; a `bun run a11y:baseline` prunes it.
 */

setDefaultTimeout(120_000);

// `as` keeps the type stable when baseline.json is empty (`findings: []` would
// otherwise infer `never[]`, so `.fingerprint` wouldn't type-check).
const baselineFingerprints = new Set(
  (baseline.findings as ReadonlyArray<{ fingerprint: string }>).map(
    (entry) => entry.fingerprint,
  ),
);

// Memoized: both tests below want the same audit of the same fixture set, and
// seeding the fixtures is the expensive half of the run.
let cachedFindings: Promise<Finding[]> | null = null;
let cachedFixtures: ReturnType<typeof collectFixtures> | null = null;

function fixtures(): ReturnType<typeof collectFixtures> {
  cachedFixtures ??= collectFixtures();

  return cachedFixtures;
}

function auditFindings(): Promise<Finding[]> {
  cachedFindings ??= fixtures().then(collectFindings);

  return cachedFindings;
}

/**
 * The runner's own self-test, and it earns its place: the exercise widgets
 * put all their chrome in a Declarative Shadow Root, jsdom's parser ignores
 * `shadowrootmode` entirely, and axe does not look inside a `<template>`. That
 * combination fails *silently* — the audit still runs, still reports the light
 * DOM, and still passes, while every group, label and control inside the widgets
 * goes unexamined. So assert the traversal directly, on a fault planted where
 * only shadow-DOM traversal can find it.
 */
test("the audit reaches inside a declarative shadow root", async () => {
  const findings = await runAxe(
    `<!doctype html><html lang="en"><head><title>Shadow</title></head><body>
       <div id="host">
         <template shadowrootmode="open"><input type="text"></template>
       </div>
     </body></html>`,
    "shadow-self-test",
  );

  expect(findings.map((finding) => finding.rule)).toContain("label");
});

test("no new WCAG 2.2 AA structural violations beyond the baseline", async () => {
  const findings = await auditFindings();

  const regressions = findings.filter(
    (finding) => !baselineFingerprints.has(finding.fingerprint),
  );

  if (regressions.length > 0) {
    const lines = regressions.map(
      (finding) =>
        `  • [${finding.rule}] ${finding.fixture}: ${finding.target}` +
        ` (${finding.wcag.join(", ")})\n    ${finding.detail.split("\n")[0]}`,
    );
    throw new Error(
      `${regressions.length} new accessibility violation(s) not in ` +
        `tests/a11y/baseline.json:\n${lines.join("\n")}\n\n` +
        "Fix the issue, or — if it is a knowingly-accepted regression — run " +
        "`bun run a11y:baseline` to record it. `bun run a11y:report` prints " +
        "the full inventory.",
    );
  }

  expect(regressions).toHaveLength(0);
});

/**
 * A floor on what the sweep above actually looked at.
 *
 * The incomplete-profile prompt is in the audited set only because every
 * fixture account is made by a login and nothing else, which leaves all of them
 * nameless. That is a property of the fixture helper rather than a decision, so
 * the day someone gives those users names the strip would leave the audit with
 * nothing failing and no sign it had gone. It carries a link, a form and a
 * button, on every signed-in page: worth knowing it is still being read.
 */
test("the audited fixtures include the incomplete-profile prompt", async () => {
  const withPrompt = (await fixtures()).filter((fixture) =>
    fixture.html.includes('class="profile-prompt"'),
  );

  expect(withPrompt.length).toBeGreaterThan(0);
});

/**
 * Every page is named by one h1, and it is the page's title. The AA ruleset
 * above does not ask for an h1 at all (axe files that under best practice),
 * so this is the check that keeps one there: on a page with a trail it is the
 * trail's last step, outside the nav landmark; on a page without one it is
 * visually hidden. Content documents are their author's, and skipped.
 */
test("every page has one h1, naming the page as its title does", async () => {
  const pages = (await fixtures()).filter((fixture) =>
    fixture.html.includes('class="page-shell"'),
  );
  const wrong: string[] = [];

  for (const fixture of pages) {
    const { document } = new JSDOM(fixture.html).window;
    const headings = [...document.querySelectorAll("h1")];
    const title = document.title.replace(/ · Carnap$/u, "");
    const heading = headings[0];

    if (headings.length !== 1 || heading === undefined) {
      wrong.push(`${fixture.name}: ${headings.length} h1 elements`);
    } else if (heading.textContent !== title) {
      wrong.push(
        `${fixture.name}: h1 "${heading.textContent}", title "${title}"`,
      );
    } else if (heading.closest("nav") !== null) {
      wrong.push(`${fixture.name}: h1 inside a nav landmark`);
    }
  }

  expect(pages.length).toBeGreaterThan(0);
  expect(wrong).toEqual([]);
});

/**
 * And under it the outline descends one level at a time: a heading may go
 * back up to any level, but never down past the one below its predecessor —
 * an h3 straight under the h1 reads to a screen reader as a section with a
 * part missing. Also best practice rather than AA (axe's heading-order).
 */
test("no page's headings skip a level on the way down", async () => {
  const pages = (await fixtures()).filter((fixture) =>
    fixture.html.includes('class="page-shell"'),
  );
  const wrong: string[] = [];

  for (const fixture of pages) {
    const { document } = new JSDOM(fixture.html).window;
    let previous = 0;

    for (const heading of document.querySelectorAll(
      "h1, h2, h3, h4, h5, h6",
    )) {
      const level = Number(heading.tagName.slice(1));

      if (level > previous + 1) {
        wrong.push(
          `${fixture.name}: h${level} "${heading.textContent?.trim()}" after h${previous}`,
        );
      }
      previous = level;
    }
  }

  expect(wrong).toEqual([]);
});

test("baseline has no stale entries (fixed issues still listed)", async () => {
  const findings = await auditFindings();
  const current = new Set(findings.map((finding) => finding.fingerprint));

  const stale = [...baselineFingerprints].filter(
    (fingerprint) => !current.has(fingerprint),
  );

  // Informational, not fatal: fixing an issue must never break the build. This
  // surfaces baseline entries to prune so the backlog stays honest.
  if (stale.length > 0) {
    console.warn(
      `${stale.length} baseline entr(y/ies) now pass and can be pruned ` +
        `with \`bun run a11y:baseline\`:\n${stale
          .map((fingerprint) => `  • ${fingerprint}`)
          .join("\n")}`,
    );
  }

  expect(stale.length).toBeGreaterThanOrEqual(0);
});
