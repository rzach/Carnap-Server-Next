import { describe, expect, test } from "bun:test";

import { TABLE_FILTER_SCRIPT } from "../../src/worker/web/layout-scripts";
import { dom, domDocument } from "../helpers/dom";

/**
 * The filter over a long roster: a funnel and the field it opens, in a column
 * heading. The server ships both hidden and the rows whole; the narrowing
 * exists only once the script has run, so it is the shell's own source,
 * evaluated here in jsdom as a page evaluates it.
 */
interface Fixture {
  readonly empty: HTMLElement;
  readonly control: HTMLElement;
  readonly input: HTMLInputElement;
  readonly toggle: HTMLButtonElement;
  readonly shown: () => readonly string[];
  readonly type: (text: string) => void;
}

function fixture(rows: readonly string[]): Fixture {
  // Only this file's fixture is cleared: the document is shared, and another
  // file's markup may be sitting in the body.
  for (const stale of domDocument.querySelectorAll("[data-filter-fixture]")) {
    stale.remove();
  }

  const host = domDocument.createElement("div");

  host.setAttribute("data-filter-fixture", "");
  host.innerHTML =
    '<div class="table-filter" data-table-filter="" id="roster">' +
    '<table><thead><tr><th>User <span data-column-aside="">' +
    '<span data-table-filter-control="roster" hidden>' +
    '<input aria-label="Filter members" hidden type="search">' +
    '<button aria-expanded="false" type="button">Filter members</button>' +
    "</span></span></th></tr></thead><tbody>" +
    rows.join("") +
    "</tbody></table>" +
    '<p class="small" data-table-filter-empty="" hidden>No member matches.</p>' +
    "</div>";
  domDocument.body.appendChild(host);

  new Function(TABLE_FILTER_SCRIPT)();

  const input = host.querySelector("input") as unknown as HTMLInputElement;

  return {
    empty: host.querySelector(
      "[data-table-filter-empty]",
    ) as unknown as HTMLElement,
    control: host.querySelector(
      "[data-table-filter-control]",
    ) as unknown as HTMLElement,
    input,
    shown: () =>
      Array.from(host.querySelectorAll("tbody tr"))
        .filter((row) => !(row as unknown as HTMLElement).hidden)
        .map((row) => row.querySelector("td")?.textContent ?? ""),
    toggle: host.querySelector(
      "[data-table-filter-control] button",
    ) as unknown as HTMLButtonElement,
    type: (text) => {
      input.value = text;
      input.dispatchEvent(new dom.window.Event("input"));
    },
  };
}

function row(name: string, email: string, aside = ""): string {
  return `<tr><td>${name}</td><td>${email}${aside}</td></tr>`;
}

describe("the roster filter", () => {
  test("opens from its funnel, and narrows to the rows whose text holds the query", () => {
    const roster = fixture([
      row("Mateo García", "mateo.13@students.example.test"),
      row("Ada Okafor", "ada.0@students.example.test"),
      row("Ben Lindqvist", "ben.1@students.example.test"),
    ]);

    // The funnel appears with the script; the field waits for it.
    expect(roster.control.hidden).toBe(false);
    expect(roster.input.hidden).toBe(true);
    roster.toggle.click();
    expect(roster.input.hidden).toBe(false);
    expect(roster.toggle.getAttribute("aria-expanded")).toBe("true");
    expect(roster.shown()).toHaveLength(3);

    // Case and accents fold away, and the address counts as much as the name.
    roster.type("GARCIA");
    expect(roster.shown()).toEqual(["Mateo García"]);
    roster.type("ben.1@");
    expect(roster.shown()).toEqual(["Ben Lindqvist"]);
    expect(roster.empty.hidden).toBe(true);

    roster.type("zzz");
    expect(roster.shown()).toEqual([]);
    expect(roster.empty.hidden).toBe(false);

    roster.type("  ");
    expect(roster.shown()).toHaveLength(3);
    expect(roster.empty.hidden).toBe(true);
  });

  test("closing the field empties it and brings every row back", () => {
    const roster = fixture([
      row("Mateo García", "mateo.13@students.example.test"),
      row("Ada Okafor", "ada.0@students.example.test"),
    ]);

    roster.toggle.click();
    roster.type("ada");
    expect(roster.shown()).toEqual(["Ada Okafor"]);

    roster.toggle.click();
    expect(roster.input.hidden).toBe(true);
    expect(roster.toggle.getAttribute("aria-expanded")).toBe("false");
    expect(roster.input.value).toBe("");
    expect(roster.shown()).toHaveLength(2);

    // Escape in the field does the same.
    roster.toggle.click();
    roster.type("ada");
    roster.input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(roster.input.hidden).toBe(true);
    expect(roster.shown()).toHaveLength(2);
  });

  test("does not match the text of a row's closed dialog", () => {
    // Every member's row keeps an accommodation dialog beside its button; its
    // field labels are in every row, and must not make every row match.
    const dialog =
      "<dialog><label>Extra time minutes<input></label></dialog>";
    const roster = fixture([
      row("Ada Okafor", "ada.0@students.example.test", dialog),
      row("Ben Lindqvist", "ben.1@students.example.test", dialog),
    ]);

    roster.toggle.click();
    roster.type("time");
    expect(roster.shown()).toEqual([]);
  });
});
