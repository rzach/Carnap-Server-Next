import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import { ATTEMPT_TIMER_SCRIPT } from "../../src/worker/web/assignment-scripts";

/**
 * The timed attempt's countdown script, over the markup `AttemptTimer`
 * renders. The reader's clock is the window's `Date.now`, set by hand; the
 * server's is the `data-now` the page was rendered with. A `visibilitychange`
 * makes the script look at the clock again without waiting for its tick.
 */
const SERVED = Date.parse("2026-10-28T12:00:00.000Z");
const MINUTE = 60_000;

function pageWithTimer(options: {
  /** How far the reader's clock runs ahead of the server's. */
  readonly skew?: number;
  readonly stored?: string;
  /** Time left at the moment the page was rendered. */
  readonly left: number;
}): {
  readonly advance: (ms: number) => void;
  readonly document: Document;
  readonly window: Window & typeof globalThis;
} {
  const ends = new Date(SERVED + options.left).toISOString();
  const dom = new JSDOM(
    `<!doctype html><html lang="en"><head><title>Quiz</title></head><body>
       <p class="attempt-line" data-attempt-timer-line="">
         <span>Attempt 1</span>
         <span class="attempt-timer attempt-line-timer" data-attempt-timer=""
               data-ends="${ends}" data-now="${new Date(SERVED).toISOString()}">
           <span>Time ends <time datetime="${ends}">${ends}</time></span>
           <span data-attempt-timer-pill="" hidden>
             <button aria-pressed="false" data-attempt-timer-pin=""
                     type="button"><span data-attempt-timer-text=""></span></button>
             <button aria-label="Hide time left" data-attempt-timer-hide=""
                     type="button"></button>
           </span>
           <button aria-label="Show time left" data-attempt-timer-show="" hidden
                   type="button"></button>
           <span data-attempt-timer-status="" role="status"></span>
           <script type="application/json" data-carnap-timer-strings>{"locale":"en"}</script>
         </span>
       </p>
     </body></html>`,
    { runScripts: "outside-only", url: "https://example.test/quiz" },
  );
  const window = dom.window as unknown as Window & typeof globalThis;
  let clock = SERVED + (options.skew ?? 0);

  window.Date.now = () => clock;

  if (options.stored !== undefined) {
    window.localStorage.setItem("carnap:attempt-timer", options.stored);
  }

  (window as unknown as { eval(code: string): void }).eval(
    ATTEMPT_TIMER_SCRIPT,
  );

  return {
    advance: (ms) => {
      clock += ms;
      window.document.dispatchEvent(new window.Event("visibilitychange"));
    },
    document: window.document,
    window,
  };
}

const part = (document: Document, name: string): HTMLElement =>
  document.querySelector(`[data-attempt-timer-${name}]`) as HTMLElement;

describe("the attempt timer", () => {
  test("counts what is left on the server's clock, not the reader's", () => {
    // The reader's clock is an hour fast; read by it, the time would be up.
    const { document } = pageWithTimer({
      left: 12 * MINUTE,
      skew: 60 * MINUTE,
    });

    expect(part(document, "pill").hidden).toBe(false);
    expect(part(document, "show").hidden).toBe(true);
    expect(part(document, "text").textContent).toMatch(/^12 min left$/);
    expect(
      document
        .querySelector("[data-attempt-timer]")
        ?.getAttribute("data-state"),
    ).toBe("running");
  });

  test("rounds down, and reads in seconds in the last minute", () => {
    const { advance, document } = pageWithTimer({
      left: 90 * MINUTE + 59_000,
    });

    expect(part(document, "text").textContent).toMatch(/1 hr.*30 min left/);

    advance(90 * MINUTE + 14_000);

    expect(part(document, "text").textContent).toMatch(/^45 sec left$/);
  });

  test("pins the line it sits in, and remembers it", () => {
    const { document, window } = pageWithTimer({ left: 12 * MINUTE });
    const line = document.querySelector(".attempt-line") as HTMLElement;

    part(document, "pin").click();

    expect(line.hasAttribute("data-pinned")).toBe(true);
    expect(part(document, "pin").getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("carnap:attempt-timer")).toBe(
      "pinned",
    );

    part(document, "pin").click();

    expect(line.hasAttribute("data-pinned")).toBe(false);
    expect(window.localStorage.getItem("carnap:attempt-timer")).toBeNull();
  });

  test("a hidden count stays hidden on the next page, until it runs out", () => {
    const { advance, document } = pageWithTimer({
      left: 2 * MINUTE,
      stored: "hidden",
    });

    // The stopwatch stands where the pill was.
    expect(part(document, "pill").hidden).toBe(true);
    expect(part(document, "show").hidden).toBe(false);

    advance(2 * MINUTE);

    // The end is said whether the count was hidden or not, and there is
    // nothing left to hide.
    expect(part(document, "pill").hidden).toBe(false);
    expect(part(document, "show").hidden).toBe(true);
    expect(part(document, "hide").hidden).toBe(true);
    expect(part(document, "text").textContent).toBe("Time is up");
  });

  test("the cross hides the count, and the stopwatch brings it back", () => {
    const { document, window } = pageWithTimer({ left: 12 * MINUTE });

    part(document, "hide").click();

    expect(part(document, "pill").hidden).toBe(true);
    expect(part(document, "show").hidden).toBe(false);
    // Focus follows to the button standing in the pressed one's place.
    expect(document.activeElement).toBe(part(document, "show"));
    expect(window.localStorage.getItem("carnap:attempt-timer")).toBe(
      "hidden",
    );

    part(document, "show").click();

    expect(part(document, "pill").hidden).toBe(false);
    expect(part(document, "show").hidden).toBe(true);
    expect(document.activeElement).toBe(part(document, "pin"));
    expect(window.localStorage.getItem("carnap:attempt-timer")).toBeNull();
  });

  test("hiding a pinned count unpins the line", () => {
    const { document } = pageWithTimer({
      left: 12 * MINUTE,
      stored: "pinned",
    });
    const line = document.querySelector(".attempt-line") as HTMLElement;

    expect(line.hasAttribute("data-pinned")).toBe(true);

    part(document, "hide").click();

    expect(line.hasAttribute("data-pinned")).toBe(false);
  });

  test("says ten, five and one minute, once each, and then that time is up", () => {
    const { advance, document } = pageWithTimer({
      left: 10 * MINUTE + 30_000,
    });
    const status = part(document, "status");
    const timer = document.querySelector(
      "[data-attempt-timer]",
    ) as HTMLElement;

    expect(status.textContent).toBe("");

    advance(40_000);
    expect(status.textContent).toBe("10 minutes left.");

    status.textContent = "";
    advance(1_000);
    expect(status.textContent).toBe("");

    advance(5 * MINUTE);
    expect(status.textContent).toBe("5 minutes left.");
    expect(timer.getAttribute("data-state")).toBe("low");

    advance(4 * MINUTE);
    expect(status.textContent).toBe("1 minute left.");

    advance(MINUTE);
    expect(status.textContent).toBe(
      "Time is up. Answers can no longer be submitted.",
    );
    expect(timer.getAttribute("data-state")).toBe("over");
  });

  test("a warning already passed when the page loads is not said", () => {
    const { advance, document } = pageWithTimer({ left: 7 * MINUTE });
    const status = part(document, "status");

    expect(status.textContent).toBe("");

    advance(MINUTE);
    expect(status.textContent).toBe("");

    advance(MINUTE + 1_000);
    expect(status.textContent).toBe("5 minutes left.");
  });

  test("a page whose timer is missing a part is left alone", () => {
    const dom = new JSDOM(
      `<!doctype html><body><span data-attempt-timer="" data-ends="nope"></span></body>`,
      { runScripts: "outside-only" },
    );

    expect(() =>
      (dom.window as unknown as { eval(code: string): void }).eval(
        ATTEMPT_TIMER_SCRIPT,
      ),
    ).not.toThrow();
  });
});
