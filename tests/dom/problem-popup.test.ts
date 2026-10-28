import { describe, expect, test } from "bun:test";

import { dom, domDocument } from "../helpers/dom";

/**
 * The bubble the tree, Prawitz and truth-tree widgets float a field's problem
 * in, where a `title` used to be. Tested on its own: what the islands add is
 * only the attribute, and what can regress here is the behaviour WCAG 1.4.13
 * asks of hover content — it can be hovered, it stays, Escape dismisses it —
 * and its going when the problem does.
 */

// After `helpers/dom` has installed the globals.
const { mountProblemPopup } = await import(
  "../../src/client/components/problem-popup"
);

/** Past the hover delay (300 ms), or the grace on leaving (150 ms). */
const settle = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function fixture() {
  const host = domDocument.createElement("div");
  domDocument.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const scope = domDocument.createElement("div");
  scope.innerHTML =
    '<span class="a" data-problem="Expected a formula.">p →</span>' +
    '<span class="b" data-problem="Cites a line out of scope." data-problem-severity="warning">q</span>' +
    '<span class="c">r</span>';
  root.appendChild(scope);
  // jsdom's addEventListener refuses a signal from Bun's own controller.
  const controller = new dom.window.AbortController();
  mountProblemPopup(
    root as unknown as ShadowRoot,
    scope as unknown as HTMLElement,
    controller.signal as unknown as AbortSignal,
  );
  const field = (name: string) => scope.querySelector(`.${name}`) as Element;
  const popup = () => root.querySelector(".problem-popup") as HTMLElement;

  return { controller, field, popup, scope };
}

/** The mouse arriving at or leaving `target`, as a phone's tap also does
 *  (the browser makes mouse events of it): the popup hears nothing else. */
function pointer(
  type: "over" | "out",
  target: Element,
  related: Element | null = null,
): void {
  target.dispatchEvent(
    new dom.window.MouseEvent(`mouse${type}`, {
      bubbles: true,
      relatedTarget: related,
    }),
  );
}

function pressEscape(): void {
  domDocument.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
  );
}

describe("the problem popup", () => {
  test("floats a field's problem once the pointer rests on it", async () => {
    const { field, popup } = fixture();

    expect(popup().hidden).toBe(true);
    pointer("over", field("a"));
    expect(popup().hidden).toBe(true);
    await settle(350);

    expect(popup().hidden).toBe(false);
    expect(popup().textContent).toBe("Expected a formula.");
    expect(popup().dataset.severity).toBe("error");
    // The field's hidden note already says it to a screen reader.
    expect(popup().getAttribute("aria-hidden")).toBe("true");
  });

  test("says when the problem is a warning", async () => {
    const { field, popup } = fixture();

    pointer("over", field("b"));
    await settle(350);

    expect(popup().dataset.severity).toBe("warning");
  });

  test("floats nothing over a field without a problem", async () => {
    const { field, popup } = fixture();

    pointer("over", field("c"));
    await settle(350);

    expect(popup().hidden).toBe(true);
  });

  test("stays while the pointer crosses onto it, and goes when it leaves both", async () => {
    const { field, popup } = fixture();

    pointer("over", field("a"));
    await settle(350);
    pointer("out", field("a"), popup());
    pointer("over", popup());
    await settle(200);
    expect(popup().hidden).toBe(false);

    pointer("out", popup(), field("c"));
    pointer("over", field("c"));
    await settle(200);
    expect(popup().hidden).toBe(true);
  });

  test("moves straight to the next field's problem once one is shown", async () => {
    const { field, popup } = fixture();

    pointer("over", field("a"));
    await settle(350);
    pointer("out", field("a"), field("b"));
    pointer("over", field("b"));

    expect(popup().textContent).toBe("Cites a line out of scope.");
  });

  test("Escape dismisses it, and resting on the field does not bring it back", async () => {
    const { field, popup } = fixture();

    pointer("over", field("a"));
    await settle(350);
    pressEscape();
    expect(popup().hidden).toBe(true);

    pointer("over", field("a"));
    await settle(350);
    expect(popup().hidden).toBe(true);

    pointer("out", field("a"), field("c"));
    pointer("over", field("c"));
    pointer("out", field("c"), field("a"));
    pointer("over", field("a"));
    await settle(350);
    expect(popup().hidden).toBe(false);
  });

  test("goes when the field's problem changes or the field does", async () => {
    const { field, popup, scope } = fixture();

    pointer("over", field("a"));
    await settle(350);
    field("a").setAttribute("data-problem", "Expected a rule.");
    await settle(0);
    expect(popup().hidden).toBe(true);

    pointer("out", field("a"), field("b"));
    pointer("over", field("b"));
    await settle(350);
    expect(popup().hidden).toBe(false);
    scope.removeChild(field("b"));
    await settle(0);
    expect(popup().hidden).toBe(true);
  });

  test("lets go when its widget does", async () => {
    const { controller, field, popup } = fixture();

    pointer("over", field("a"));
    controller.abort();
    await settle(350);

    expect(popup().hidden).toBe(true);
  });
});
