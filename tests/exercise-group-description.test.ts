import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import { compileCarnapMarkdown } from "../src/worker/application/content/compiler";
import { createDefaultExerciseRegistry } from "../src/worker/application/content/registry";
import { renderCompiledContent } from "../src/worker/application/content/renderer";
import { exerciseGroupDescription } from "../src/worker/exercise-kit/group";
import { i18nFor } from "../src/worker/i18n";
import { SHOWCASE_DEMO_SOURCE } from "./helpers/showcase-demo";

/**
 * Every exercise group is described as well as named (gh #16): a screen reader
 * entering its controls hears which exercise it is (the legend) and then what
 * to do there — the author's prompt, or, with none, the type's own instruction.
 *
 * Which types are checked is the showcase lesson's answer, the one document
 * with an exercise of every kind; a type it does not reach fails by name.
 */

const registry = createDefaultExerciseRegistry();

interface Group {
  readonly fieldset: Element;
  /** Where the group's ids resolve: its shadow root, or the page. */
  readonly root: DocumentFragment | Document;
  readonly kind: string;
  /** The light-DOM prompt a widget slots in, or null. */
  readonly slottedPrompt: Element | null;
}

async function groups(source: string, locale = "en"): Promise<Group[]> {
  const compiled = await compileCarnapMarkdown(source);

  if (!compiled.ok) {
    throw new Error(compiled.diagnostics.map((d) => d.code).join(", "));
  }

  const { document } = new JSDOM(
    renderCompiledContent(compiled.artifact, i18nFor(locale)),
  ).window;

  return [...document.querySelectorAll("[data-exercise-kind]")].map(
    (host) => {
      const kind = host.getAttribute("data-exercise-kind") ?? "";
      // jsdom does not attach a declarative shadow root; it leaves the template.
      const template = host.querySelector<HTMLTemplateElement>(
        ":scope > template[shadowrootmode]",
      );
      const root = template?.content ?? document;
      const fieldset = root.querySelector("fieldset.exercise-group");

      if (fieldset === null) {
        throw new Error(`${kind} renders no exercise group`);
      }

      return {
        fieldset,
        kind,
        root,
        slottedPrompt: host.querySelector(':scope > [slot="prompt"]'),
      };
    },
  );
}

function describedBy(group: Group): Element {
  const id = group.fieldset.getAttribute("aria-describedby");

  expect(id, `${group.kind} group has aria-describedby`).not.toBeNull();

  const described = group.root.getElementById(id ?? "");

  expect(
    described,
    `${group.kind}: #${id} is in the group's root`,
  ).not.toBeNull();

  return described as Element;
}

function instructionsOf(kind: string, locale = "en"): readonly string[] {
  const type = registry.types().find((candidate) => candidate.kind === kind);

  if (type === undefined) {
    throw new Error(`no type for ${kind}`);
  }

  return Object.values(type.instructions(i18nFor(locale)));
}

describe("exercise group descriptions", () => {
  test("every type's group is described by its prompt, in the group's own root", async () => {
    const found = await groups(SHOWCASE_DEMO_SOURCE);
    const kinds = new Set(found.map((group) => group.kind));

    for (const type of registry.types()) {
      expect(kinds.has(type.kind), `the showcase has a ${type.kind}`).toBe(
        true,
      );
    }

    for (const group of found) {
      const described = describedBy(group);
      // A widget slots its prompt in even when the author wrote none, so a
      // prompt is one with something in it.
      const prompted =
        (group.slottedPrompt?.innerHTML.trim() ?? "") !== "" ||
        group.fieldset.querySelector(".exercise-prompt") !== null;

      if (prompted) {
        // A slot when the prompt is light DOM a shadow root shows, the prompt
        // itself when the group is in the light DOM.
        expect(
          described.querySelector('slot[name="prompt"], .exercise-prompt'),
          `${group.kind} is described by its prompt`,
        ).not.toBeNull();
      } else {
        expect(instructionsOf(group.kind)).toContain(
          described.textContent ?? "",
        );
      }
    }
  });

  test("a group with no prompt is described by its type's instruction, only to a screen reader", async () => {
    const found = await groups(
      [
        "::::truth-table{#t1}",
        "- P -> P",
        "::::",
        "",
        "::::syntax-tree{#s1}",
        "- P /\\ Q",
        "::::",
        "",
        ":::short-answer{#a1 answer=yes}",
        ":::",
      ].join("\n"),
      "de",
    );
    const words = found.map((group) => {
      const described = describedBy(group);

      expect(described.classList.contains("visually-hidden")).toBe(true);

      return described.textContent;
    });

    expect(words).toEqual([
      "Füllen Sie die Wahrheitstafel aus oder füllen Sie eine Zeile aus, die ein Gegenbeispiel ist, und markieren Sie sie.",
      "Wählen Sie den Hauptjunktor jedes Satzes, bis nur noch atomare Sätze übrig sind.",
      "Geben Sie Ihre Antwort ein.",
    ]);
  });

  test("the instruction is picked by the exercise's mode", async () => {
    const found = await groups(
      [
        "::::truth-table{#t1 variant=partial}",
        "- P -> P",
        "::::",
        "",
        ':::aufbau-proof-fitch{system="forallx-magnus" #f1 playground}',
        "----",
        "P :AS",
        ":::",
      ].join("\n"),
    );

    expect(found.map((group) => describedBy(group).textContent)).toEqual([
      "Choose a value for each sentence letter, then fill in the rest of the row.",
      "Write a proof of anything you like; every line must follow by a rule.",
    ]);
  });

  test("the markup escapes the instruction and the id", () => {
    const description = exerciseGroupDescription(
      null,
      "Pick <one>.",
      'ex"1-description',
    );

    expect(description.describedBy).toBe(
      ' aria-describedby="ex&quot;1-description"',
    );
    expect(description.html).toContain("Pick &lt;one&gt;.");
  });
});
