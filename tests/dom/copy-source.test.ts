import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { dom, domDocument } from "../helpers/dom";

/**
 * The author preview's "Copy as source": which bar it lands in, where in the
 * row, that it appears only while an author is editing, and that it says so
 * once the text is on the clipboard. The widgets that use it are Preact islands
 * (one over a WASM proof engine), none of which is involved in these questions.
 */

// After `helpers/dom` has installed the globals: the module builds elements
// through the document it finds on `globalThis`.
const { mountCopySource } = await import(
  "../../src/client/components/copy-source"
);

const STRINGS = { copied: "Copied.", label: "Copy as source" };
const BAR =
  '<div class="exercise-actions">' +
  '<button class="help-trigger" type="button">?</button>' +
  '<button class="world-check" type="button">Check</button>' +
  '<button class="exercise-submit" type="submit" disabled>Submit answer</button>' +
  '<p aria-live="polite" class="exercise-status" data-exercise-status></p>' +
  "</div>";

const globals = globalThis as Record<string, unknown>;
const saved = { location: globals.location, navigator: globals.navigator };
let clipboard: string[];

beforeEach(() => {
  clipboard = [];
  // The revision editor's live preview is a `srcdoc` frame.
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "about:srcdoc" },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          clipboard.push(text);
        },
      },
    },
  });
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
});

function fixture(html: string, inForm = false): HTMLElement {
  const host = domDocument.createElement("div");
  host.innerHTML = html;

  if (inForm) {
    const form = domDocument.createElement("form");
    form.className = "exercise-submission";
    form.append(host);
    domDocument.body.append(form);
  } else {
    domDocument.body.append(host);
  }

  return host as unknown as HTMLElement;
}

describe("mountCopySource", () => {
  test("goes before Submit, after the widget's own buttons", () => {
    const host = fixture(BAR);
    const button = mountCopySource(
      host,
      STRINGS,
      () => "| block : small cube",
    );

    expect(button?.type).toBe("button");
    expect(button?.textContent).toBe("Copy as source");
    expect(
      Array.from(host.querySelectorAll(".exercise-actions button")).map(
        (child) => child.className,
      ),
    ).toEqual([
      "help-trigger",
      "world-check",
      "copy-source",
      "exercise-submit",
    ]);
  });

  test("copies the source and says so on the bar's status line", async () => {
    const host = fixture(BAR);
    const button = mountCopySource(host, STRINGS, () => "l1: $ P $ by AS []");

    button?.dispatchEvent(new dom.window.Event("click"));
    await Promise.resolve();
    await Promise.resolve();

    expect(clipboard).toEqual(["l1: $ P $ by AS []"]);
    expect(host.querySelector("[data-exercise-status]")?.textContent).toBe(
      "Copied.",
    );
  });

  test("copies nothing when the widget has nothing to copy", async () => {
    const host = fixture(BAR);
    const button = mountCopySource(host, STRINGS, () => null);

    button?.dispatchEvent(new dom.window.Event("click"));
    await Promise.resolve();

    expect(clipboard).toEqual([]);
    expect(host.querySelector("[data-exercise-status]")?.textContent).toBe(
      "",
    );
  });

  test("is not offered to a student, whose exercise sits in a submission form", () => {
    const host = fixture(BAR, true);

    expect(mountCopySource(host, STRINGS, () => "")).toBeNull();
    expect(host.querySelector(".copy-source")).toBeNull();
  });

  test("is not offered outside the editor's preview frame", () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "http://localhost/content/revisions/1" },
    });
    const host = fixture(BAR);

    expect(mountCopySource(host, STRINGS, () => "")).toBeNull();
  });
});
