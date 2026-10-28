import { describe, expect, setDefaultTimeout, test } from "bun:test";

import type { Env } from "../src/worker/env";
import { grantTestContentAuthor } from "./helpers/admin";
import { appRequest, createTestApp } from "./helpers/app";
import {
  createCourse,
  enrollStudent,
  jsonRequest,
  type LoginResult,
  login,
  withStorage,
} from "./helpers/http";

setDefaultTimeout(30_000);

const DAY = 86_400_000;

/** Two one-point questions, so a student can be halfway through. */
const TWO_QUESTIONS = `# Problem set

::::multiple-choice{#q1 title="First" points="1"}
Choose yes.

- [x] yes | Yes
- [ ] no | No
::::

::::multiple-choice{#q2 title="Second" points="1"}
Choose yes again.

- [x] yes | Yes
- [ ] no | No
::::
`;

async function createRevision(
  env: Env,
  author: LoginResult,
): Promise<string> {
  await grantTestContentAuthor(env, author.actorId);

  const item = await appRequest(
    createTestApp(),
    "/content",
    jsonRequest({ title: "Problem set" }, author),
    env,
  );
  const itemId = ((await item.json()) as { item: { id: string } }).item.id;
  const revision = await appRequest(
    createTestApp(),
    `/content/${itemId}/revisions`,
    jsonRequest({ sourceText: TWO_QUESTIONS }, author),
    env,
  );

  expect(revision.status).toBe(201);

  return ((await revision.json()) as { revision: { id: string } }).revision
    .id;
}

async function publishedAssignment(
  env: Env,
  instructor: LoginResult,
  courseId: string,
  revisionId: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const draft = await appRequest(
    createTestApp(),
    `/courses/${courseId}/assignments`,
    jsonRequest({ contentRevisionId: revisionId, ...fields }, instructor),
    env,
  );

  expect(draft.status).toBe(201);

  const id = ((await draft.json()) as { assignment: { id: string } })
    .assignment.id;
  const published = await appRequest(
    createTestApp(),
    `/courses/${courseId}/assignments/${id}/publish`,
    jsonRequest({}, instructor),
    env,
  );

  expect(published.status).toBe(200);

  return id;
}

async function startAttempt(
  env: Env,
  student: LoginResult,
  courseId: string,
  assignmentId: string,
): Promise<string> {
  const response = await appRequest(
    createTestApp(),
    `/courses/${courseId}/assignments/${assignmentId}/attempts`,
    jsonRequest({}, student),
    env,
  );

  expect(response.status).toBe(201);

  return ((await response.json()) as { attempt: { id: string } }).attempt.id;
}

async function answer(
  env: Env,
  student: LoginResult,
  courseId: string,
  assignmentId: string,
  attemptId: string,
  exerciseId: string,
): Promise<void> {
  const response = await appRequest(
    createTestApp(),
    `/courses/${courseId}/assignments/${assignmentId}/attempts/${attemptId}/submissions`,
    jsonRequest(
      {
        answer: {
          data: { selectedOptionIds: ["yes"] },
          kind: "multiple-choice-answer@1",
          schemaVersion: 1,
        },
        exerciseId,
      },
      student,
    ),
    env,
  );

  expect(response.status).toBe(201);
}

async function page(
  env: Env,
  reader: LoginResult,
  path: string,
): Promise<{ readonly html: string; readonly status: number }> {
  const response = await appRequest(
    createTestApp(),
    path,
    { headers: { Accept: "text/html", Cookie: reader.cookieHeader } },
    env,
  );

  return { html: await response.text(), status: response.status };
}

/** The `<tr>` whose title cell holds `title`. */
function row(html: string, title: string): string {
  const match = new RegExp(
    `<tr>(?:(?!</tr>).)*?${title}(?:(?!</tr>).)*</tr>`,
  ).exec(html);

  if (match === null) {
    throw new Error(`No row for ${title}.`);
  }

  return match[0];
}

describe("the student course page", () => {
  test("groups work by its date and says where the student is with each", async () => {
    await withStorage(async (_storage, env) => {
      const instructor = await login(env, "groups-teacher@example.test");
      const student = await login(env, "groups-student@example.test");
      const courseId = await createCourse(env, instructor);
      const revisionId = await createRevision(env, instructor);
      const now = Date.now();
      const at = (days: number) => new Date(now + days * DAY).toISOString();

      await enrollStudent(env, instructor, student, courseId);

      // Created in an order the page must not keep: it sorts by date.
      const later = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        { dueAt: at(9), title: "Due later" },
      );
      const soon = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        { dueAt: at(2), title: "Due soon" },
      );
      const done = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        { dueAt: at(4), title: "All answered" },
      );

      await publishedAssignment(env, instructor, courseId, revisionId, {
        dueAt: at(-3),
        title: "Missed one",
      });
      const halfDone = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        { dueAt: at(-2), title: "Half done" },
      );

      await publishedAssignment(env, instructor, courseId, revisionId, {
        assessmentMode: "none",
        title: "Background reading",
      });

      const halfAttempt = await startAttempt(
        env,
        student,
        courseId,
        halfDone,
      );

      await answer(env, student, courseId, halfDone, halfAttempt, "q1");

      const soonAttempt = await startAttempt(env, student, courseId, soon);

      await answer(env, student, courseId, soon, soonAttempt, "q1");

      const doneAttempt = await startAttempt(env, student, courseId, done);

      await answer(env, student, courseId, done, doneAttempt, "q1");
      await answer(env, student, courseId, done, doneAttempt, "q2");

      const { html, status } = await page(
        env,
        student,
        `/courses/${courseId}`,
      );

      expect(status).toBe(200);
      // Three groups, in this order, each under a heading of its own.
      const upcoming = html.indexOf('scope="rowgroup">Upcoming<');
      const past = html.indexOf('scope="rowgroup">Past<');
      const undated = html.indexOf('scope="rowgroup">No due date<');

      expect(upcoming).toBeGreaterThan(-1);
      expect(past).toBeGreaterThan(upcoming);
      expect(undated).toBeGreaterThan(past);
      // Soonest first among what is ahead, whatever order it was made in.
      expect(html.indexOf("Due soon", upcoming)).toBeLessThan(
        html.indexOf("Due later", upcoming),
      );
      expect(html.indexOf("Missed one")).toBeGreaterThan(past);
      expect(html.lastIndexOf("Background reading")).toBeGreaterThan(undated);

      // Where the student is, in plain words; colour only for the exception.
      expect(row(html, "Due soon")).toContain("In progress · 1 of 2");
      // Past due with some of it in: the word in gold, the count plain.
      expect(row(html, "Half done")).toContain(
        '<span class="work-status-warn">Incomplete</span> · 1 of 2',
      );

      expect(row(html, "Due later")).toContain("Not started");
      expect(row(html, "All answered")).toContain("Completed");
      expect(row(html, "Missed one")).toContain(
        '<span class="work-status-danger">Nothing submitted</span>',
      );
      // A reading has nothing to complete, so no status at all.
      expect(row(html, "Background reading")).not.toMatch(
        /Not started|Completed|In progress/,
      );

      // No separate "Next up" box: the Upcoming group, soonest first, is it.
      expect(html).not.toContain("Next up");
      // A date ahead is to the minute, in the reader's calendar, with how far
      // off it is; a date gone by is the day alone.
      expect(row(html, "Due later")).toContain(
        `<time data-weekday="" datetime="${at(9)}">`,
      );
      expect(row(html, "Due later")).toContain(
        `data-relative-day="${at(9)}"`,
      );
      expect(row(html, "Missed one")).toContain(
        `<time data-day="" data-weekday="" datetime="${at(-3)}">`,
      );
      expect(html).toContain(`/courses/${courseId}/assignments/${later}`);
    });
  });

  test("an open attempt is headed by a line saying where it stands", async () => {
    await withStorage(async (_storage, env) => {
      const instructor = await login(env, "line-teacher@example.test");
      const student = await login(env, "line-student@example.test");
      const courseId = await createCourse(env, instructor);
      const revisionId = await createRevision(env, instructor);
      const now = Date.now();

      await enrollStudent(env, instructor, student, courseId);

      const ahead = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        {
          dueAt: new Date(now + 2 * DAY).toISOString(),
          maxAttempts: 3,
          title: "Ahead",
        },
      );
      const overdue = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        { dueAt: new Date(now - DAY).toISOString(), title: "Overdue" },
      );
      const policy = await appRequest(
        createTestApp(),
        `/courses/${courseId}/instructor/assignments/${overdue}/late-policy`,
        jsonRequest(
          {
            graceMinutes: 0,
            kind: "percent_per_day",
            maxPercentPenalty: 50,
            percentPenalty: 10,
          },
          instructor,
        ),
        env,
      );

      expect(policy.status).toBe(200);

      // Before an attempt the briefing says all this; the line is the open
      // attempt's.
      expect(
        (
          await page(
            env,
            student,
            `/courses/${courseId}/assignments/${ahead}`,
          )
        ).html,
      ).not.toContain('class="attempt-line');

      const attemptId = await startAttempt(env, student, courseId, ahead);

      await answer(env, student, courseId, ahead, attemptId, "q1");

      const open = await page(
        env,
        student,
        `/courses/${courseId}/assignments/${ahead}`,
      );
      const line = open.html.slice(
        open.html.indexOf('<p class="attempt-line">'),
        open.html.indexOf("</p>", open.html.indexOf('class="attempt-line')),
      );

      expect(line).toContain("Attempt 1 of 3");
      expect(line).toContain("Due <time");
      // Not timed, so nothing counts down.
      expect(line).not.toContain("data-attempt-timer");
      expect(line).toContain("1 of 2 answered");
      expect(line).toContain(
        `href="/courses/${courseId}/assignments/${ahead}/results">Results</a>`,
      );

      await startAttempt(env, student, courseId, overdue);

      const late = await page(
        env,
        student,
        `/courses/${courseId}/assignments/${overdue}`,
      );

      // Past due, the line turns gold and says what lateness costs; with
      // nothing answered there is no Results link yet.
      expect(late.html).toContain('class="attempt-line attempt-line-late"');
      expect(late.html).toContain("Past due since <time");
      expect(late.html).toContain(
        "Late work loses 10% for each day it is late, up to 50%.",
      );
      expect(late.html).toContain("0 of 2 answered");
      expect(late.html).not.toContain(`${overdue}/results">Results</a>`);
    });
  });
});

describe("a timed attempt's timer", () => {
  test("ends the attempt line, and heads the content only where it stands on its own", async () => {
    await withStorage(async (_storage, env) => {
      const instructor = await login(env, "timer-teacher@example.test");
      const student = await login(env, "timer-student@example.test");
      const courseId = await createCourse(env, instructor);
      const revisionId = await createRevision(env, instructor);
      // Thirty minutes allowed, but the assignment closes in ten: the server
      // stops taking answers at the close, so that is what the timer counts
      // down to.
      const closes = new Date(Date.now() + 10 * 60_000).toISOString();

      await enrollStudent(env, instructor, student, courseId);

      const timed = await publishedAssignment(
        env,
        instructor,
        courseId,
        revisionId,
        { availableUntil: closes, timeLimitMinutes: 30, title: "Quiz" },
      );

      await startAttempt(env, student, courseId, timed);

      const base = `/courses/${courseId}/assignments/${timed}`;
      const open = await page(env, student, base);
      const lineStart = open.html.indexOf('class="attempt-line"');

      expect(lineStart).toBeGreaterThan(-1);

      const line = open.html.slice(
        lineStart,
        open.html.indexOf("</p>", lineStart),
      );

      expect(line).toContain("data-attempt-timer-line");
      expect(line).toContain(`data-ends="${closes}"`);
      expect(line).toContain(`Time ends <time datetime="${closes}">`);
      // The count and its controls wait for the script, which fills them.
      expect(line).toContain('aria-pressed="false"');
      expect(line).toContain('role="status"');
      expect(line).toContain("data-carnap-timer-strings");

      // Standing on its own — an LMS launch, the fullscreen link — the
      // content carries the timer itself; in our frame, under the line, not.
      const standalone = await page(env, student, `${base}/content`);
      const framed = await page(env, student, `${base}/content?appframe=1`);

      expect(standalone.status).toBe(200);
      expect(standalone.html).toContain(
        '<p class="attempt-timer-line" data-attempt-timer-line="">',
      );
      expect(standalone.html).toContain(`data-ends="${closes}"`);
      expect(framed.status).toBe(200);
      expect(framed.html).not.toContain("data-attempt-timer");
    });
  });
});

describe("the course description", () => {
  test("an instructor writes it, and students read it at the top of the course", async () => {
    await withStorage(async (_storage, env) => {
      const instructor = await login(
        env,
        "about-course-teacher@example.test",
      );
      const student = await login(env, "about-course-student@example.test");
      const courseId = await createCourse(env, instructor);
      const editorPath = `/courses/${courseId}/description`;

      await enrollStudent(env, instructor, student, courseId);

      // The instructor's course record leads to it; the editor is theirs.
      expect(
        (await page(env, instructor, `/courses/${courseId}`)).html,
      ).toContain(`href="${editorPath}"`);
      expect((await page(env, student, editorPath)).status).toBe(403);

      const editor = await page(env, instructor, editorPath);

      expect(editor.status).toBe(200);
      expect(editor.html).toContain('data-source-format="prose"');

      // A directive a description cannot hold is refused where it is
      // written, and the text comes back for fixing.
      const refusedSource = ":::style\n.x { color: red }\n:::";
      const refused = await appRequest(
        createTestApp(),
        editorPath,
        {
          body: new URLSearchParams({
            csrfToken: instructor.csrfToken,
            source: refusedSource,
          }),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: instructor.cookieHeader,
          },
          method: "POST",
        },
        env,
      );
      const refusedHtml = await refused.text();

      expect(refused.status).toBe(200);
      expect(refusedHtml).toContain(".x { color: red }");
      expect(refusedHtml).toContain("is not supported here");

      const saved = await appRequest(
        createTestApp(),
        editorPath,
        jsonRequest(
          { source: "Office hours: **Tuesdays**, 2–4 pm." },
          instructor,
        ),
        env,
      );

      expect(saved.status).toBe(200);

      const course = await page(env, student, `/courses/${courseId}`);

      expect(course.html).toContain(
        '<section class="sheet course-description">',
      );
      expect(course.html).toContain("<strong>Tuesdays</strong>");
      // Above the assignments, which come after it on the page.
      expect(course.html.indexOf("course-description")).toBeLessThan(
        course.html.indexOf("<h2>Assignments</h2>"),
      );

      // A clone keeps it, for the next term to edit.
      const clone = await appRequest(
        createTestApp(),
        `/courses/${courseId}/clone`,
        jsonRequest({ title: "Next term" }, instructor),
        env,
      );
      const cloned = (await clone.json()) as {
        course: { description: { source: string } | null };
      };

      expect(cloned.course.description?.source).toBe(
        "Office hours: **Tuesdays**, 2–4 pm.",
      );

      // Blank clears it.
      await appRequest(
        createTestApp(),
        editorPath,
        jsonRequest({ source: "  " }, instructor),
        env,
      );

      expect(
        (await page(env, student, `/courses/${courseId}`)).html,
      ).not.toContain("course-description");
    });
  });
});
