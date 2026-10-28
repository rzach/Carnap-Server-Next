import {
  ANSWER_RECORDED_EVENT,
  UNSAVED_ANSWER_ATTRIBUTE,
} from "../exercise-kit/answer-events";
import {
  CORRECTNESS_MARK_CLASS,
  CORRECTNESS_MARK_GLYPHS,
  CORRECTNESS_MARK_LABEL_ATTRIBUTES,
} from "../exercise-kit/correctness-mark";
import { LOCAL_TIMESTAMP_FIELDS } from "./timestamp-formats";
import {
  ATTEMPT_TIMER_UI_STRINGS_ATTRIBUTE,
  EXERCISE_UI_STRINGS_ATTRIBUTE,
  REVIEW_UI_STRINGS_ATTRIBUTE,
  readStringsPrelude,
} from "./ui-strings";

/**
 * The assignment pages' scripts, split out of `assignment-detail.tsx` so
 * {@link ./script-assets} can build files from them without importing the
 * module that renders the markup. See `layout-scripts.ts` for the same split.
 *
 * They divide by page, not by concern: a student answering exercises and an
 * instructor reviewing them are two different documents, and shipping each the
 * other's code would be a request neither of them can use.
 *
 * All of them are loaded `defer`, so the runtime-state and UI-string payloads
 * at the end of the body are parsed before the first line runs.
 */

/**
 * Reveals a "couldn't load — reload" notice for any interactive exercise whose
 * custom element has not enhanced within a deadline. Carnap requires JS for
 * exercises, so an element that never enhances — its bundle failed to load, or
 * it loaded but could not adopt its shadow root — leaves the inert Declarative
 * Shadow DOM on screen with no way to answer; this turns that silent dead state
 * into an actionable message. Enhanced elements set `data-enhanced="true"` (see
 * the client base class), so that marker, not merely `:defined`, is the health
 * signal. Only interactive forms carry a hyphenated custom element, so
 * read-only text forms are skipped.
 */
const COMPONENT_FAILURE_SCRIPT = `
(() => {
${readStringsPrelude(EXERCISE_UI_STRINGS_ATTRIBUTE)}

  const DEADLINE_MS = 8000;
  const forms = document.querySelectorAll("form.exercise-submission");

  if (forms.length === 0) {
    return;
  }

  window.setTimeout(() => {
    for (const form of forms) {
      const element = form.querySelector("[data-exercise-id]");

      if (element === null || element.tagName.indexOf("-") === -1) {
        continue;
      }

      if (element.dataset.enhanced === "true") {
        continue;
      }

      if (form.querySelector(".exercise-load-error") !== null) {
        continue;
      }

      const notice = document.createElement("p");
      notice.className = "exercise-load-error";
      notice.setAttribute("role", "alert");
      notice.textContent =
        S.loadFailed || "This exercise couldn't load. Please reload the page.";
      form.appendChild(notice);
    }
  }, DEADLINE_MS);
})();
`;

/**
 * The exercise runtime: submits every answer form with fetch, keeps its status
 * line current, and warns before a navigation would discard an answer that has
 * not been recorded.
 *
 * Exported only so the jsdom tests (`tests/unsaved-changes.test.ts` and the
 * `tests/dom` runtime tests) can drive it. The alternative — seeding a course,
 * an assignment and an open attempt just to get at the script — tests the
 * seeding, not the runtime.
 */
const EXERCISE_RUNTIME_SCRIPT = `
(() => {
${readStringsPrelude(EXERCISE_UI_STRINGS_ATTRIBUTE)}

  const MARK_GLYPHS = ${JSON.stringify(CORRECTNESS_MARK_GLYPHS)};
  const MARK_LABEL_ATTRIBUTES = ${JSON.stringify(
    CORRECTNESS_MARK_LABEL_ATTRIBUTES,
  )};

  const stateElement = document.querySelector(
    "[data-carnap-exercise-runtime-state]",
  );
  const runtime = stateElement === null
    ? { exercises: {} }
    : JSON.parse(stateElement.textContent || '{"exercises":{}}');
  const exercises = runtime.exercises || {};

  // Placeholder substitution only — the server already picked the message and
  // resolved it for this locale; all that is left is filling the values in.
  function fill(template, values) {
    return String(template).replace(/\\{(\\w+)\\}/g, (match, name) =>
      name in values ? String(values[name]) : match,
    );
  }

  // The reader's own clock, in the page's language, and the same form the
  // shell gives every <time> element — the server's first paint of this line
  // is in UTC, since it cannot know the zone.
  const submittedFormat = new Intl.DateTimeFormat(
    S.locale || undefined,
    ${JSON.stringify(LOCAL_TIMESTAMP_FIELDS)},
  );

  function submittedText(timestamp) {
    const date = new Date(timestamp);

    return Number.isNaN(date.getTime())
      ? String(timestamp)
      : submittedFormat.format(date);
  }

  // \`points\` is the exercise's declared value, from the form's data-points:
  // the line ends in it before there is a score to show (see
  // \`exerciseStatusText\` for the server's half, which this mirrors).
  function statusText(state, points) {
    if (state === undefined) {
      return points === 0
        ? S.noSubmission || "No submission in this attempt."
        : fill(
            S.noSubmissionPoints ||
              "No submission in this attempt · –/{maxScore}.",
            { maxScore: points },
          );
    }

    const evaluation = state.evaluation;
    const when = submittedText(state.submission.submittedAt);

    // No evaluation, or one whose numbers this student may not see yet: the
    // line says the work is in, and what it is worth. A score is a grade, and
    // grades wait for the release date however much the exercise is willing
    // to say.
    if (!evaluation || evaluation.score === null) {
      return points === 0
        ? fill(S.submittedAt || "Submitted at {when}.", { when })
        : fill(S.submittedAtPoints || "Submitted at {when} · –/{maxScore}.", {
            maxScore: points,
            when,
          });
    }

    // A zero-point exercise has no score worth a line: \`0/0\` says nothing.
    if (evaluation.maxScore === 0) {
      return fill(S.submittedAt || "Submitted at {when}.", { when });
    }

    return fill(
      S.submittedAtScored || "Submitted at {when} · {score}/{maxScore}.",
      { maxScore: evaluation.maxScore, score: evaluation.score, when },
    );
  }

  // The recorded answer's verdict, for the correctness mark: is what the server
  // holds *fully* right? Partial credit is not a green check, and an ungraded
  // submission (a hand-marked free response) is not one either — both leave the
  // mark idle, which is what "we do not know that this is right" looks like.
  //
  // Read off the server's own word rather than compared out of the numbers,
  // which are not always here to compare.
  function recordedVerdict(state) {
    const evaluation = state === undefined ? null : state.evaluation;

    return evaluation && evaluation.verdict === "correct" ? "ok" : "idle";
  }

  // The runtime only ever writes these two states, so it needs neither the
  // spinner nor the hover detail the client base class's setMark handles. A
  // widget that can grade itself in the browser overwrites whatever is set here
  // as soon as it has a live verdict; see worker/exercise-kit/correctness-mark.ts.
  function setMark(form, state) {
    const mark = form.querySelector(".${CORRECTNESS_MARK_CLASS}");

    if (mark === null) {
      return;
    }

    const label = mark.getAttribute(MARK_LABEL_ATTRIBUTES[state]);

    mark.dataset.state = state;
    mark.textContent = MARK_GLYPHS[state];

    if (label !== null) {
      mark.setAttribute("aria-label", label);
      // Assigned, not left alone: a widget may have put its own complaint here,
      // and a submission that scores full marks must not keep it as the tooltip
      // over a green check.
      mark.title = label;
    }
  }

  function formAnswer(form) {
    const data = new FormData(form);
    const kind = String(data.get("answerKind") || "");
    const schemaVersion = Number(data.get("schemaVersion") || "0");
    let answerData;

    // An enhancing custom element writes its answer into the hidden answerData
    // field; prefer it when present.
    const encodedAnswer = String(data.get("answerData") || "");

    if (encodedAnswer.length > 0) {
      answerData = JSON.parse(encodedAnswer);
    } else if (data.has("text")) {
      // Free-response and short-answer have no enhancing element yet, so their
      // native text field is read directly until they produce answerData too.
      answerData = { text: String(data.get("text") || "") };
    } else {
      throw new Error(
        S.noAnswerFields || "This exercise form has no known answer fields.",
      );
    }

    return {
      answer: { data: answerData, kind, schemaVersion },
      exerciseId: String(data.get("exerciseId") || ""),
    };
  }

  function idempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function stateFromResponse(body) {
    return {
      evaluation: body.evaluation,
      submission: {
        exerciseId: body.submission.exerciseId,
        submittedAt: body.submission.submittedAt,
      },
    };
  }

  async function errorMessage(response) {
    try {
      const body = await response.json();

      return (
        body.error?.message || S.submitFailed || "The submission was not accepted."
      );
    } catch (_error) {
      return S.submitFailed || "The submission was not accepted.";
    }
  }

  // Leaving with an answer the server has not got should ask first — a reload
  // of a page full of half-finished proofs is otherwise silent and total.
  //
  // The guard lives here, in the content document, because that is the frame
  // the exercise forms are in — and a beforeunload inside a same-origin frame
  // also stops the enclosing assignment page from navigating or reloading. One
  // guard therefore covers the inline frame and the fullscreen view both.
  //
  // An interactive exercise answers for itself: its element flags itself while
  // the reader is ahead of the server, because only the element can tell an
  // edit from one of its own recomputations. The text types have no element, so
  // their saved state is what the server rendered into the field.
  const savedText = new WeakMap();

  function textAnswer(form) {
    const field = form.querySelector("[name=text]");

    return field === null ? null : field.value;
  }

  function hasUnsavedWork() {
    for (const form of document.querySelectorAll("form.exercise-submission")) {
      if (form.querySelector("[data-exercise-id][${UNSAVED_ANSWER_ATTRIBUTE}]") !== null) {
        return true;
      }

      const text = textAnswer(form);

      if (text !== null && savedText.get(form) !== text) {
        return true;
      }
    }

    return false;
  }

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedWork()) {
      return;
    }

    // The browser writes the wording and decides whether to show it at all, so
    // there is nothing here to translate. Assigning returnValue is the older
    // spelling of the same request, still needed by some engines.
    event.preventDefault();
    event.returnValue = "";
  });

  for (const form of document.querySelectorAll("form.exercise-submission")) {
    const exerciseId = form.dataset.exerciseId || "";
    const points = Number(form.dataset.points) || 0;
    const status = form.querySelector("[data-exercise-status]");
    const button = form.querySelector("button[type=submit]");

    if (status !== null) {
      status.textContent = statusText(exercises[exerciseId], points);
    }

    setMark(form, recordedVerdict(exercises[exerciseId]));
    savedText.set(form, textAnswer(form));

    // The text types have no element to notice an edit for them, so the mark
    // they carry has to come down here: once the field differs from what was
    // recorded, the recorded verdict is about something else.
    // Typed back to what was recorded, the recorded verdict applies again, so
    // this restores as well as clears rather than latching off.
    const field = form.querySelector("[name=text]");

    field?.addEventListener("input", () => {
      setMark(
        form,
        field.value === savedText.get(form)
          ? recordedVerdict(exercises[exerciseId])
          : "idle",
      );
    });

    form.addEventListener("submit", async (event) => {
      // A widget that will not submit yet — text its syntax gate refuses, a
      // check still settling — cancels the event from a *capturing* listener
      // (see CarnapExerciseElement.gateSubmit), which the target runs before
      // this one whatever order the two were registered in; the component
      // bundles load after this script, so registration order would have put
      // the request first. Honour the cancel the way native submission would:
      // no request.
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();

      // Read before the request, not after: an edit made while it is in flight
      // is unsaved work, and marking the form clean on arrival would lose it.
      const sentText = textAnswer(form);

      if (status !== null) {
        status.textContent = S.submitting || "Submitting…";
      }

      if (button !== null) {
        button.disabled = true;
      }

      try {
        const payload = formAnswer(form);
        const response = await fetch(form.action, {
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey(),
            "X-CSRF-Token": form.querySelector("[name=csrfToken]")?.value || "",
          },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(await errorMessage(response));
        }

        const body = await response.json();

        // A checked-but-not-recorded answer leaves the last recorded
        // submission in place; the status line just says to keep going. It also
        // leaves the form dirty — nothing was stored, so leaving the page still
        // loses the attempt.
        if (body.recorded === false) {
          if (status !== null) {
            status.textContent =
              S.notRecorded ||
              "Not correct yet, so nothing was recorded. Try again.";
          }
        } else {
          savedText.set(form, sentText);
          // Tells the element to take what it holds as the new saved state.
          form.dispatchEvent(new CustomEvent("${ANSWER_RECORDED_EVENT}"));

          exercises[exerciseId] = stateFromResponse(body);

          if (status !== null) {
            status.textContent = statusText(exercises[exerciseId], points);
          }

          setMark(form, recordedVerdict(exercises[exerciseId]));
        }

        form.dispatchEvent(new CustomEvent("carnap:exercise-submitted", {
          bubbles: true,
          detail: body,
        }));
      } catch (error) {
        if (status !== null) {
          status.textContent = error instanceof Error
            ? error.message
            : S.submitFailed || "The submission was not accepted.";
        }
      } finally {
        if (button !== null) {
          button.disabled = false;
        }
      }
    });
  }
})();
`;

/**
 * Progressive enhancement for the review queue: submit the approve and
 * manual-evaluation forms with fetch and reconcile the card in place instead of
 * reloading. Without JS the forms POST and redirect as before; this only takes
 * over once it can, and mirrors the server's render of the new state — the
 * status line, the review-state word, whether the one-click approve still
 * applies, the Unreviewed count, and (on the Unreviewed tab) dropping
 * the card out of the queue it no longer belongs in. A grade can move which of
 * a student's tries counts, so the reply carries every such try's new state
 * and the script redraws each card it moved; one that now belongs on this tab
 * but is not on the page is mentioned, with a reload offered, never forced.
 */
const REVIEW_ACTIONS_SCRIPT = `
(() => {
${readStringsPrelude(REVIEW_UI_STRINGS_ATTRIBUTE)}

  const NEEDS_REVIEW = "needs-review";
  // The states of a try that counts toward a grade: what Active lists.
  const COUNTING = ["auto-graded", "needs-review", "reviewed"];
  const STATES = S.states || {};
  const EVALUATORS = S.evaluators || {};

  function stateLabelText(state) {
    return STATES[state] || state;
  }

  // Placeholder substitution only; the server resolved the message already.
  function fill(template, values) {
    return String(template).replace(/\\{(\\w+)\\}/g, (match, name) =>
      name in values ? String(values[name]) : match,
    );
  }

  function csrfToken(form) {
    const input = form.querySelector("[name=csrfToken]");

    return input === null ? "" : input.value;
  }

  function evaluationText(evaluation) {
    // Nothing is withheld from an instructor, and this script only ever runs on
    // their review queue — the null check mirrors the server's so the two
    // cannot disagree about a card, not because it is expected to fire.
    if (!evaluation || evaluation.score === null) {
      return S.notGraded || "Not graded";
    }

    // Same id the server's evaluationText uses, so the line does not change
    // shape when this script rewrites a card in place.
    return fill(S.scored || "{score}/{maxScore} · {evaluator}", {
      evaluator: EVALUATORS[evaluation.evaluatorKind] ||
        evaluation.evaluatorKind,
      maxScore: evaluation.maxScore,
      score: evaluation.score,
    });
  }

  // Mirrors storedPointsDrift on the server: the status span carries the
  // current declared points in data-nominal-points ("" when the exercise has
  // left the assignment), and the note says how the stored denominator
  // disagrees — or null when it does not.
  function driftNoteText(evaluation, status) {
    if (!evaluation || evaluation.maxScore === null) {
      return null;
    }

    const nominal = status.dataset.nominalPoints;

    if (nominal === undefined || nominal === "") {
      return S.driftRemoved || "no longer in the assignment";
    }

    if (Number(nominal) === Number(evaluation.maxScore)) {
      return null;
    }

    return fill(S.driftChanged || "now worth {points}", { points: nominal });
  }

  const list = document.querySelector(".submission-review-list");
  const filterNav = document.querySelector(".review-filter");
  const filter = filterNav === null ? "all" : filterNav.dataset.filter || "all";
  const needsCount = document.querySelector(".review-count-needs");
  const activeCount = document.querySelector(".review-count-active");
  // How each student's tries at an exercise stand since the last grade given
  // on this page. Before one, the footer's attributes say how they were drawn.
  const groups = new Map();

  function counts(state) {
    return COUNTING.indexOf(state) !== -1;
  }

  // Whether this tab lists a try in this state: the server's filter, over the
  // same machine values.
  function shows(state) {
    if (filter === "needs-review") {
      return state === NEEDS_REVIEW;
    }

    return filter === "active" ? counts(state) : true;
  }

  function adjust(element, delta) {
    if (element !== null && delta !== 0) {
      element.textContent = String(Number(element.textContent) + delta);
    }
  }

  function showEmptyStateIfCleared() {
    if (
      list === null ||
      list.querySelector(".submission-review-card") !== null
    ) {
      return;
    }

    const message =
      filter === "needs-review"
        ? S.allReviewed || "Every submission that counts has been reviewed."
        : filter === "active"
          ? S.noneCount ||
            "None of the recorded submissions counts toward a grade. They are listed under All."
          : null;

    if (message === null) {
      return;
    }

    const sheet = document.createElement("section");
    sheet.className = "sheet";
    const section = document.createElement("div");
    section.className = "sheet-section";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    section.appendChild(paragraph);
    sheet.appendChild(section);
    list.replaceWith(sheet);
  }

  // A grade made a try count that this tab is not showing. It is said in the
  // status line the page draws empty under the tabs, with a reload to follow
  // if the grader wants it, rather than reloading under them.
  function noteOtherTry(student) {
    const region = document.querySelector(".review-other-try");

    if (region === null) {
      return;
    }

    region.textContent =
      fill(S.otherTryCounts || "A different try by {student} now counts.", {
        student,
      }) + " ";

    const link = document.createElement("a");
    link.href = window.location.href;
    link.textContent = S.reloadToShow || "Reload to show it";
    region.appendChild(link);
  }

  function showError(card, message) {
    let error = card.querySelector(".review-action-error");

    if (error === null) {
      error = document.createElement("p");
      error.className = "review-action-error small";
      error.setAttribute("role", "alert");
      const footer = card.querySelector(".submission-review-footer");
      (footer === null ? card : footer).appendChild(error);
    }

    error.textContent = message;
  }

  function clearError(card) {
    const error = card.querySelector(".review-action-error");

    if (error !== null) {
      error.remove();
    }
  }

  // The reply names the new state of every live try the student has made at
  // this exercise, since a grade on one can move which counts. Each of their
  // cards on the page is relabelled, or dropped from a tab that no longer
  // lists it, and the tab counts move by what changed in the group.
  function applyResult(card, body) {
    clearError(card);

    const evaluation = body.evaluation;
    const tries = Array.isArray(body.tries) ? body.tries : [];
    const heading = card.querySelector("h2");
    const student = heading === null ? "" : heading.textContent;
    const ownLabel = card.querySelector(".review-state-label");
    const ownId = ownLabel === null ? null : ownLabel.dataset.submissionId;
    const own = tries.find((entry) => entry.submissionId === ownId);
    const footer = card.querySelector(".submission-review-footer");

    if (footer !== null) {
      const key = footer.dataset.tryGroup;
      const before = groups.get(key) || {
        counting: Number(footer.dataset.groupCounting) || 0,
        needs: Number(footer.dataset.groupNeeds) || 0,
      };
      const after = {
        counting: tries.filter((entry) => counts(entry.state)).length,
        needs: tries.filter((entry) => entry.state === NEEDS_REVIEW).length,
      };

      adjust(activeCount, after.counting - before.counting);
      adjust(needsCount, after.needs - before.needs);
      groups.set(key, after);
    }

    const status = card.querySelector(".submission-review-status");

    if (status !== null) {
      // Wipes any server-rendered drift note along with the old line; the
      // drift is then re-derived from the fresh evaluation, since a manual
      // grade is stamped with the current points (drift gone) while an
      // approval copies the automatic's old figure (drift stays). It warns
      // about grades that count, so a try that does not gets none.
      status.textContent = evaluationText(evaluation);

      const note =
        own !== undefined && counts(own.state)
          ? driftNoteText(evaluation, status)
          : null;

      status.classList.toggle("points-drift", note !== null);

      if (note !== null) {
        const span = document.createElement("span");

        span.className = "points-drift-note";
        span.textContent = " \\u00b7 " + note;
        status.appendChild(span);
      }
    }

    const details = card.querySelector("details.manual-evaluation");

    if (details !== null) {
      details.open = false;
    }

    const labels = new Map();

    for (const label of document.querySelectorAll(".review-state-label")) {
      labels.set(label.dataset.submissionId, label);
    }

    let unseen = false;

    for (const entry of tries) {
      const label = labels.get(entry.submissionId);

      if (label === undefined) {
        unseen = unseen || shows(entry.state);
        continue;
      }

      const other = label.closest(".submission-review-card");

      if (!shows(entry.state)) {
        other.remove();
        continue;
      }

      // A try that has come to need a grade opens its form, as the server
      // draws one; a form the grader opened is never shut under them.
      if (
        entry.state === NEEDS_REVIEW &&
        label.dataset.reviewState !== NEEDS_REVIEW
      ) {
        const form = other.querySelector("details.manual-evaluation");

        if (form !== null) {
          form.open = true;
        }
      }

      // Both halves: the value for the script, the word for the reader.
      label.dataset.reviewState = entry.state;
      label.textContent = stateLabelText(entry.state);

      const approve = other.querySelector(".approve-score-form");

      if (approve !== null && entry.state !== NEEDS_REVIEW) {
        approve.remove();
      }
    }

    if (unseen) {
      noteOtherTry(student);
    }

    showEmptyStateIfCleared();
  }

  async function errorMessage(response) {
    try {
      const body = await response.json();

      return (
        (body.error && body.error.message) ||
        S.actionFailed ||
        "The action was not accepted."
      );
    } catch (_error) {
      return S.actionFailed || "The action was not accepted.";
    }
  }

  // The cards after this one, in order, before a grade can remove any: the
  // card a grader moves on to is the first of them still on the page.
  function cardsAfter(card) {
    const cards = [...document.querySelectorAll(".submission-review-card")];

    return cards.slice(cards.indexOf(card) + 1);
  }

  // Ctrl+Enter's second half: open the next card's grading form and put the
  // grader in its score field.
  function moveOn(following) {
    const next = following.find((other) => other.isConnected);
    const details =
      next === undefined
        ? null
        : next.querySelector("details.manual-evaluation");

    if (details === null) {
      return;
    }

    details.open = true;

    const score = details.querySelector("[name=score]");

    if (score !== null) {
      score.focus();
    }
  }

  async function submit(form, payload, advance) {
    const card = form.closest(".submission-review-card");
    const button = form.querySelector("button[type=submit]");
    const following = advance && card !== null ? cardsAfter(card) : [];

    if (button !== null) {
      button.disabled = true;
    }

    try {
      const response = await fetch(form.action, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken(form),
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }

      const body = await response.json();

      if (card !== null) {
        applyResult(card, body);
      }

      if (advance) {
        moveOn(following);
      }
    } catch (error) {
      if (card !== null) {
        showError(
          card,
          error instanceof Error
            ? error.message
            : S.actionFailed || "The action was not accepted.",
        );
      }
    } finally {
      // Harmless if the card (and this button) was removed on success.
      if (button !== null) {
        button.disabled = false;
      }
    }
  }

  // The help panel names the keys as they are bound here: Cmd on a Mac.
  if (/Mac/.test(navigator.platform)) {
    for (const key of document.querySelectorAll("kbd[data-mac-key]")) {
      key.textContent = key.dataset.macKey;
    }
  }

  // While an approval is on its way the button is disabled, which stops a
  // click; the shortcut goes round the button, so it asks too.
  function approve(form, advance) {
    const button = form.querySelector("button[type=submit]");

    if (button !== null && button.disabled) {
      return;
    }

    submit(form, {}, advance);
  }

  for (const form of document.querySelectorAll("form.approve-score-form")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      approve(form, false);
    });
  }

  function grade(form, advance) {
    // While a grade is on its way the button is disabled, which stops a
    // browser's own Enter; the shortcut goes round the button, so it asks too.
    const button = form.querySelector("button[type=submit]");

    if ((button !== null && button.disabled) || !form.reportValidity()) {
      return;
    }

    const data = new FormData(form);
    const feedback = String(data.get("feedback") || "");
    // The score alone: what it is out of belongs to the exercise, and the
    // server reads it there. Sending one would be refused.
    submit(
      form,
      {
        feedback: feedback.length === 0 ? null : feedback,
        score: Number(data.get("score")),
      },
      advance,
    );
  }

  for (const form of document.querySelectorAll("form.manual-evaluation-form")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      grade(form, false);
    });
  }

  // Ctrl+Enter (Cmd+Enter on a Mac) saves and moves to the next card, from
  // the score or the feedback alike. Plain Enter keeps what a browser does
  // with it — saves from the score, starts a line in the feedback — so it
  // never moves the grader anywhere they did not ask to go. With Shift it
  // approves the autograded score instead, where the card still offers one.
  // Heard on the footer rather than the form, so that it works from the
  // Approve button as well as from the grading form beside it.
  for (const footer of document.querySelectorAll(".submission-review-footer")) {
    footer.addEventListener("keydown", (event) => {
      if (
        event.key !== "Enter" ||
        !(event.ctrlKey || event.metaKey) ||
        event.isComposing ||
        !(event.target instanceof Element)
      ) {
        return;
      }

      const form = event.shiftKey
        ? footer.querySelector("form.approve-score-form")
        : event.target.closest("form.manual-evaluation-form");

      if (form === null) {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        approve(form, true);
      } else {
        grade(form, true);
      }
    });
  }
})();
`;

export { EXERCISE_RUNTIME_SCRIPT };

/**
 * The timed attempt's countdown (see `AttemptTimer` in `./attempt-timer.tsx`).
 * In both documents a timer can sit in — the assignment page, through the
 * shell script, and a content document standing on its own, through the
 * runtime — and a no-op wherever there is none.
 *
 * What is left is measured against the server's clock: the page carries the
 * instant it was rendered, and the difference from the reader's clock at load
 * is held for the life of the page. A reader's clock some minutes out would
 * otherwise count down to the wrong moment, and the server refuses answers by
 * its own.
 *
 * The count reads in minutes, or hours and minutes, rounded down so it never
 * promises time there is not; in the last minute it reads in seconds. It is
 * rewritten only when its text changes. The reader's choice of shown, pinned
 * or hidden is one value in local storage, so it carries to the next timed
 * attempt; a browser that refuses storage just forgets it.
 */
const ATTEMPT_TIMER_SCRIPT = `
(() => {
  const timer = document.querySelector("[data-attempt-timer]");

  if (timer === null) {
    return;
  }

${readStringsPrelude(ATTEMPT_TIMER_UI_STRINGS_ATTRIBUTE)}

  const ends = Date.parse(timer.getAttribute("data-ends") || "");
  const served = Date.parse(timer.getAttribute("data-now") || "");
  const pin = timer.querySelector("[data-attempt-timer-pin]");
  const text = timer.querySelector("[data-attempt-timer-text]");
  const pill = timer.querySelector("[data-attempt-timer-pill]");
  const hide = timer.querySelector("[data-attempt-timer-hide]");
  const show = timer.querySelector("[data-attempt-timer-show]");
  const status = timer.querySelector("[data-attempt-timer-status]");

  if (
    Number.isNaN(ends) ||
    Number.isNaN(served) ||
    pin === null ||
    text === null ||
    pill === null ||
    hide === null ||
    show === null ||
    status === null
  ) {
    return;
  }

  const line = timer.closest("[data-attempt-timer-line]") || timer;
  const locale = S.locale || undefined;
  const skew = served - Date.now();
  const remaining = () => ends - (Date.now() + skew);

  // The end as a time of day, which is what a student watching a clock wants;
  // with the weekday when it is not today. This document may have no shell
  // script to localize it, and where it has one this is the better form.
  const end = timer.querySelector("time[datetime]");

  if (end !== null) {
    const date = new Date(ends);
    const fields = { hour: "numeric", minute: "2-digit" };

    if (date.toDateString() !== new Date().toDateString()) {
      fields.weekday = "short";
    }

    end.textContent = new Intl.DateTimeFormat(locale, fields).format(date);
  }

  const durationFormat =
    typeof Intl.DurationFormat === "function"
      ? new Intl.DurationFormat(locale, { style: "short" })
      : null;
  const unitFormats = {};
  const unitFormat = (unit) =>
    (unitFormats[unit] =
      unitFormats[unit] ||
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit,
        unitDisplay: "short",
      }));
  const duration = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));

    if (total < 60) {
      return durationFormat
        ? durationFormat.format({ seconds: total })
        : unitFormat("second").format(total);
    }

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (durationFormat) {
      return durationFormat.format({ hours, minutes });
    }

    return [
      hours > 0 ? unitFormat("hour").format(hours) : "",
      minutes > 0 ? unitFormat("minute").format(minutes) : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const LOW = 5 * 60000;
  const WARNINGS = [
    [10 * 60000, S.tenMinutes || "10 minutes left."],
    [5 * 60000, S.fiveMinutes || "5 minutes left."],
    [60000, S.oneMinute || "1 minute left."],
  ];
  // A warning already behind the reader when the page loaded is not news.
  let warned = WARNINGS.filter(([at]) => remaining() <= at).length;

  const STORAGE_KEY = "carnap:attempt-timer";
  let mode = "shown";

  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === "pinned" || stored === "hidden") {
      mode = stored;
    }
  } catch (_error) {}

  const setMode = (next) => {
    mode = next;

    try {
      if (next === "shown") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch (_error) {}

    render();
  };

  let interval;

  const render = () => {
    const ms = remaining();
    const over = ms <= 0;

    timer.setAttribute("data-state", over ? "over" : ms <= LOW ? "low" : "running");
    line.toggleAttribute("data-pinned", mode === "pinned");
    pin.setAttribute("aria-pressed", mode === "pinned" ? "true" : "false");
    // Time being up is said whether the count was hidden or not, and then
    // there is nothing left to hide.
    const hidden = mode === "hidden" && !over;

    if (over && document.activeElement === show) {
      pin.focus();
    }

    pill.hidden = hidden;
    show.hidden = !hidden;
    hide.hidden = over;

    const next = over
      ? S.timeUp || "Time is up"
      : (S.left || "{duration} left").replace("{duration}", () => duration(ms));

    if (text.textContent !== next) {
      text.textContent = next;
    }

    if (over) {
      status.textContent =
        S.timeUpAnnouncement || "Time is up. Answers can no longer be submitted.";
      clearInterval(interval);
      return;
    }

    let warning = null;

    while (warned < WARNINGS.length && ms <= WARNINGS[warned][0]) {
      warning = WARNINGS[warned][1];
      warned += 1;
    }

    if (warning !== null) {
      status.textContent = warning;
    }
  };

  pin.addEventListener("click", () =>
    setMode(mode === "pinned" ? "shown" : "pinned"),
  );
  // Each takes away the button it was pressed on, so focus moves to the one
  // that stands in its place.
  hide.addEventListener("click", () => {
    setMode("hidden");
    show.focus();
  });
  show.addEventListener("click", () => {
    setMode("shown");
    pin.focus();
  });
  // A background tab's timers are slowed; coming back, catch up at once.
  document.addEventListener("visibilitychange", render);
  render();
  interval = setInterval(render, 1000);
})();
`;

export { ATTEMPT_TIMER_SCRIPT };

/**
 * The answering page: the runtime first, then the failure guard that reports a
 * component which never arrived — the order they were emitted in when both
 * were inline, and the order the guard's deadline assumes — and the timer,
 * for a document standing on its own.
 */
export const EXERCISE_SCRIPT = [
  EXERCISE_RUNTIME_SCRIPT,
  COMPONENT_FAILURE_SCRIPT,
  ATTEMPT_TIMER_SCRIPT,
].join("\n");

/** The review page, which runs no exercise runtime of its own. */
export const REVIEW_SCRIPT = REVIEW_ACTIONS_SCRIPT;
