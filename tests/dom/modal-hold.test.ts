import { afterEach, describe, expect, test } from "bun:test";

import {
  CONFIRM_SUBMIT_SCRIPT,
  DIALOG_SCRIPT,
} from "../../src/worker/web/layout-scripts";
import { dom, domDocument } from "../helpers/dom";

/**
 * A wheel or a swipe over one of the page's modals must not scroll the page
 * behind it. Both shell scripts that open a modal hold the root still — its
 * overflow hidden, its scrollbar's strip kept — until the dialog closes, and
 * leave a page that does not scroll alone. The scripts are the shell's own
 * source, evaluated here in jsdom exactly as a page evaluates them.
 */

// The shell serves these as a hashed asset; a page just evaluates it. Once,
// since each adds its listeners to the document. The window globals the shared
// DOM helper does not install are handed in from its jsdom window.
for (const script of [DIALOG_SCRIPT, CONFIRM_SUBMIT_SCRIPT]) {
  const window = dom.window;

  new Function(
    "HTMLDialogElement",
    "HTMLFormElement",
    "getComputedStyle",
    script,
  )(
    window.HTMLDialogElement,
    window.HTMLFormElement,
    window.getComputedStyle.bind(window),
  );
}

const root = domDocument.documentElement;

/** jsdom lays nothing out, so every height is 0: say how tall the page is. */
function pageHeight(scrollHeight: number): void {
  Object.defineProperty(root, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(root, "clientHeight", {
    configurable: true,
    value: 600,
  });
}

/** A dialog jsdom can open: it has the element, but not `showModal`. */
function dialog(id: string): HTMLDialogElement {
  const element = domDocument.createElement("dialog");
  element.id = id;
  Object.assign(element, {
    close: () => {
      element.removeAttribute("open");
      element.dispatchEvent(new (view().Event)("close"));
    },
    showModal: () => element.setAttribute("open", ""),
  });
  domDocument.body.appendChild(element);

  return element;
}

// The jsdom window's own Event, not the ambient one: an event built by a
// different realm is not an Event to this document's listeners.
function view(): { readonly Event: typeof Event } {
  return domDocument.defaultView as unknown as {
    readonly Event: typeof Event;
  };
}

afterEach(() => {
  domDocument.body.replaceChildren();
  Reflect.deleteProperty(root, "scrollHeight");
  Reflect.deleteProperty(root, "clientHeight");
});

describe("a modal opened from a trigger", () => {
  function trigger(): HTMLButtonElement {
    const button = domDocument.createElement("button");
    button.dataset.dialogTarget = "members";
    domDocument.body.appendChild(button);

    return button;
  }

  test("holds a page that scrolls, gutter and all, until it closes", () => {
    pageHeight(3000);
    const modal = dialog("members");

    trigger().click();

    expect(modal.hasAttribute("open")).toBe(true);
    expect(root.style.overflow).toBe("hidden");
    expect(root.style.scrollbarGutter).toBe("stable");

    modal.close();

    expect(root.style.overflow).toBe("");
    expect(root.style.scrollbarGutter).toBe("");
  });

  test("leaves a page that does not scroll alone", () => {
    pageHeight(600);
    const modal = dialog("members");

    trigger().click();

    expect(modal.hasAttribute("open")).toBe(true);
    expect(root.style.overflow).toBe("");
    expect(root.style.scrollbarGutter).toBe("");
  });
});

test("a confirmation modal holds the page the same way", () => {
  pageHeight(3000);
  const modal = dialog("confirm-release");
  const form = domDocument.createElement("form");
  form.dataset.confirmDialog = "confirm-release";
  domDocument.body.appendChild(form);

  form.dispatchEvent(
    new (view().Event)("submit", { bubbles: true, cancelable: true }),
  );

  expect(modal.hasAttribute("open")).toBe(true);
  expect(root.style.overflow).toBe("hidden");
  expect(root.style.scrollbarGutter).toBe("stable");

  modal.close();

  expect(root.style.overflow).toBe("");
});
