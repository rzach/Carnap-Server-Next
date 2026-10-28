import { describe, expect, setDefaultTimeout, test } from "bun:test";

import type { AppStores } from "../src/worker/application/stores";
import type { Env } from "../src/worker/env";
import { calendarDocument } from "../src/worker/web/calendar";
import { appRequest, createTestApp } from "./helpers/app";
import { type LoginResult, login, withStorage } from "./helpers/http";

setDefaultTimeout(30_000);

/**
 * The private calendar feed: made and retired from the profile, read by a
 * calendar app with nothing but its address. These tests pin what the feed
 * holds — the owner's due dates as they apply to them, and nothing else — and
 * that an address stops answering the moment its owner replaces or turns it
 * off.
 */

const NOW = "2026-10-01T00:00:00.000Z";
const DUE = "2026-11-02T23:59:00.000Z";

async function seedCourse(
  stores: AppStores,
  key: string,
  instructorId: string,
  options: { readonly archived?: boolean } = {},
): Promise<string> {
  const courseId = `course-${key}`;

  await stores.courses.create({
    createdAt: NOW,
    createdById: instructorId,
    id: courseId,
    timezone: "UTC",
    title: `Course ${key}`,
  });

  if (options.archived === true) {
    await stores.courses.setArchived({
      archivedAt: NOW,
      id: courseId,
      updatedAt: NOW,
    });
  }

  await stores.content.createItem({
    createdAt: NOW,
    id: `item-${key}`,
    ownerUserId: instructorId,
    sourceFormat: "markdown",
    title: `Item ${key}`,
  });
  await stores.content.createRevision({
    compiled: { exercises: [] },
    contentHash: `hash-${key}`,
    createdAt: NOW,
    createdById: instructorId,
    details: "",
    id: `revision-${key}`,
    itemId: `item-${key}`,
    revisionNumber: 1,
    sourceFormat: "markdown",
    sourceText: "# Seed",
    systemOrigins: {},
  });

  return courseId;
}

async function seedAssignment(
  stores: AppStores,
  courseId: string,
  instructorId: string,
  id: string,
  options: {
    readonly dueAt: string | null;
    readonly listed?: boolean;
    readonly published?: boolean;
  },
): Promise<void> {
  const revisionId = courseId.replace("course-", "revision-");

  await stores.assignments.create({
    assessmentMode: "graded",
    availableFrom: null,
    availableUntil: null,
    contentRevisionId: revisionId,
    courseId,
    createdAt: NOW,
    createdById: instructorId,
    description: "",
    displayOrder: 0,
    dueAt: options.dueAt,
    gradesVisibleAt: null,
    id,
    listed: options.listed ?? true,
    maxAttempts: 1,
    timeLimitMinutes: null,
    title: id,
    workVisibility: "with_grades",
    workVisibleAt: null,
  });

  if (options.published !== false) {
    await stores.assignments.publish({
      actorId: instructorId,
      contentRevisionId: revisionId,
      id,
      publishedAt: NOW,
      versionId: `${id}-version`,
    });
  }
}

async function enroll(
  stores: AppStores,
  courseId: string,
  userId: string,
): Promise<void> {
  await stores.courses.addMembership({
    courseId,
    createdAt: NOW,
    id: `${courseId}-${userId}`,
    role: "student",
    status: "active",
    userId,
  });
}

function postForm(
  env: Env,
  path: string,
  owner: LoginResult,
): Promise<Response> {
  return appRequest(
    createTestApp(),
    path,
    {
      body: new URLSearchParams({ csrfToken: owner.csrfToken }),
      headers: { Accept: "text/html", Cookie: owner.cookieHeader },
      method: "POST",
    },
    env,
  );
}

/** Make a link from the profile, as its button does, and read it off the page. */
async function makeLink(env: Env, owner: LoginResult): Promise<string> {
  const response = await postForm(env, "/profile/calendar", owner);
  const html = await response.text();
  const match = /id="new-calendar-link"[^>]*value="([^"]+)"/.exec(html);

  expect(response.status).toBe(200);

  if (match?.[1] === undefined) {
    throw new Error("The profile did not show the new calendar link.");
  }

  const url = new URL(match[1]);

  return `${url.pathname}${url.search}`;
}

/** A calendar app's request: the address alone, no cookie. */
function readFeed(env: Env, path: string): Promise<Response> {
  return appRequest(createTestApp(), path, {}, env);
}

describe("the calendar feed", () => {
  test("holds the owner's due dates as they apply to them, and nothing else", async () => {
    await withStorage(async (storage, env) => {
      const { stores } = storage;
      const instructor = await login(env, "instructor@example.test");
      const student = await login(env, "student@example.test");
      const taught = await seedCourse(stores, "a", instructor.actorId);
      const archived = await seedCourse(stores, "b", instructor.actorId, {
        archived: true,
      });
      const elsewhere = await seedCourse(stores, "c", instructor.actorId);

      await enroll(stores, taught, student.actorId);
      await enroll(stores, archived, student.actorId);
      await seedAssignment(
        stores,
        taught,
        instructor.actorId,
        "Problem set 1",
        {
          dueAt: DUE,
        },
      );
      await seedAssignment(stores, taught, instructor.actorId, "Undated", {
        dueAt: null,
      });
      await seedAssignment(stores, taught, instructor.actorId, "Draft", {
        dueAt: DUE,
        published: false,
      });
      await seedAssignment(stores, taught, instructor.actorId, "Unlisted", {
        dueAt: DUE,
        listed: false,
      });
      await seedAssignment(
        stores,
        archived,
        instructor.actorId,
        "Last term",
        {
          dueAt: DUE,
        },
      );
      await seedAssignment(
        stores,
        elsewhere,
        instructor.actorId,
        "Not mine",
        {
          dueAt: DUE,
        },
      );
      // An extension: the feed carries the date the student is held to.
      await stores.assignments.upsertOverride({
        assignmentId: "Problem set 1",
        availableFrom: null,
        availableUntil: null,
        createdById: instructor.actorId,
        dueAt: "2026-11-05T12:00:00.000Z",
        id: "override-1",
        maxAttempts: null,
        now: NOW,
        timeLimitMinutes: null,
        userId: student.actorId,
      });

      const response = await readFeed(env, await makeLink(env, student));
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/calendar; charset=utf-8",
      );
      expect(response.headers.get("cache-control")).toContain("private");
      expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
      expect(body).toContain("SUMMARY:Problem set 1 (Course a)");
      expect(body).toContain("DTSTART:20261105T120000Z");
      expect(body).toContain(`/courses/${taught}/assignments/Problem set 1`);
      expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);

      for (const absent of [
        "Undated",
        "Draft",
        "Unlisted",
        "Last term",
        "Not mine",
      ]) {
        expect(body).not.toContain(absent);
      }
    });
  });

  test("a new link retires the old one, and turning the feed off retires both", async () => {
    await withStorage(async (_storage, env) => {
      const student = await login(env, "student@example.test");
      const first = await makeLink(env, student);
      const second = await makeLink(env, student);

      expect((await readFeed(env, first)).status).toBe(404);
      expect((await readFeed(env, second)).status).toBe(200);

      const profile = async () =>
        (
          await appRequest(
            createTestApp(),
            "/profile",
            {
              headers: { Accept: "text/html", Cookie: student.cookieHeader },
            },
            env,
          )
        ).text();

      // On, the profile says so, and never shows the link again.
      const on = await profile();

      expect(on).toContain("Your calendar link was made on");
      expect(on).not.toContain("new-calendar-link");

      const off = await postForm(env, "/profile/calendar/off", student);

      expect(off.status).toBe(303);
      expect(off.headers.get("location")).toBe("/profile?calendarOff=1");
      expect((await readFeed(env, second)).status).toBe(404);
      expect(await profile()).toContain("Make a calendar link");
    });
  });

  test("answers an unknown token, no token, and a disabled owner's alike", async () => {
    await withStorage(async (storage, env) => {
      const student = await login(env, "student@example.test");
      const link = await makeLink(env, student);

      expect((await readFeed(env, "/calendar.ics")).status).toBe(404);
      expect(
        (await readFeed(env, "/calendar.ics?token=acal_nothing")).status,
      ).toBe(404);

      await storage.stores.users.disable(student.actorId, NOW);

      expect((await readFeed(env, link)).status).toBe(404);
    });
  });
});

describe("the iCalendar document", () => {
  test("escapes text and folds long lines without cutting a character", () => {
    const document = calendarDocument({
      events: [
        {
          description: "Logic; first-order, with identity\nhttps://x.test/a",
          start: "2026-11-02T23:59:00.000Z",
          summary: `Übung ${"ä".repeat(60)} (Kurs)`,
          uid: "a@x.test",
          url: "https://x.test/a",
        },
      ],
      name: "Due dates",
      now: "2026-10-01T00:00:00.000Z",
    });
    const lines = document.split("\r\n");
    const encoder = new TextEncoder();

    expect(document.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(document).toContain("DTSTART:20261102T235900Z");
    expect(document).toContain(
      "DESCRIPTION:Logic\\; first-order\\, with identity\\nhttps://x.test/a",
    );
    // Every physical line fits in 75 octets, and unfolding gives the text back.
    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(
      true,
    );
    expect(document.replace(/\r\n /g, "")).toContain(
      `SUMMARY:Übung ${"ä".repeat(60)} (Kurs)`,
    );
  });
});
