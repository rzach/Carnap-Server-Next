/**
 * `<carnap-syntax-tree>` — split a sentence by its main connectives until only
 * atomic sentences remain (gh #38, old Carnap's `.SynChecker .Match`).
 *
 * The server renders the sentence into a Declarative Shadow Root with its
 * connectives as disabled buttons (`renderSyntaxTreeElement`). On connect this
 * element replays the prior picks, enables the buttons of every sentence still
 * to split, and redraws the tree after each pick. A student may click a
 * connective in any unsplit sentence, or type one for the first unsplit
 * sentence, which is marked as the one the field answers.
 *
 * Under `scoring="whole"` a wrong pick starts the tree over: the rule that
 * keeps a student from clicking every connective in turn. The restart is
 * itself a verdict, so it happens under every `feedback`; only the sentence
 * explaining it is withheld under `none`. Under `scoring="partial"` each
 * sentence takes one pick and then shows its true split, right or wrong.
 *
 * The tree, the picks and their verdicts all come from the same DOM-free core
 * the server grades with (`exercises/syntax-tree/logic/tree.ts`), and what is
 * drawn from `display.ts`, which the server view writes out too.
 */

import type {
  DrawnNode,
  SentenceRun,
} from "../../worker/exercises/syntax-tree/display";
import {
  drawnTree,
  firstOpen,
  RUN_CLASS,
  splitNodes,
} from "../../worker/exercises/syntax-tree/display";
import {
  isPick,
  isSyntaxTreePublicData,
  judgeSyntaxTree,
  type ResolvedSyntaxTree,
  resolveSyntaxTree,
} from "../../worker/exercises/syntax-tree/grading";
import type { Pick } from "../../worker/exercises/syntax-tree/logic/tree";
import {
  isRightPick,
  nodeAt,
  parsePathKey,
  pathKey,
  typedPick,
} from "../../worker/exercises/syntax-tree/logic/tree";
import type { SyntaxTreeStringId } from "../../worker/exercises/syntax-tree/strings";
import type { SyntaxTreePublicData } from "../../worker/exercises/syntax-tree/types";
import { CarnapExerciseElement, register } from "./base";

/**
 * How long a repeated message stays cleared before it is said again: long
 * enough for a screen reader to take the empty region as a change.
 */
const REPEAT_DELAY_MS = 100;

/** A click made by Enter or Space on a button, which reports no click count. */
function fromKeyboard(event: MouseEvent): boolean {
  return event.detail === 0;
}

class CarnapSyntaxTree extends CarnapExerciseElement<SyntaxTreeStringId> {
  private data: SyntaxTreePublicData | null = null;
  private resolved: ResolvedSyntaxTree | null = null;
  private picks: Pick[] = [];
  private treeHost: HTMLElement | null = null;
  private message: HTMLElement | null = null;
  private typed: HTMLInputElement | null = null;
  private splitButton: HTMLButtonElement | null = null;
  private interactive = false;
  /** The key of the sentence a typed connective answers, as last drawn. */
  private targetKey: string | null = null;
  private repeatHandle: ReturnType<typeof setTimeout> | null = null;

  protected override get gradesLocally(): boolean {
    return true;
  }

  protected enhance(): void {
    const root = this.shadowRoot;
    const data = this.publicData;

    if (root === null || !isSyntaxTreePublicData(data)) {
      return;
    }

    this.data = data;
    this.resolved = resolveSyntaxTree(data);
    this.treeHost = root.querySelector<HTMLElement>('[data-role="tree"]');
    this.message = root.querySelector<HTMLElement>('[data-role="message"]');
    this.typed = root.querySelector<HTMLInputElement>('[data-role="typed"]');
    this.splitButton = root.querySelector<HTMLButtonElement>(
      '[data-role="split"]',
    );
    this.interactive = this.mode === "answer" && this.resolved !== null;

    if (this.interactive) {
      this.typed?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submitTyped(true);
        }
      });
      this.splitButton?.addEventListener("click", (event) =>
        this.submitTyped(fromKeyboard(event)),
      );
      this.treeHost?.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest<HTMLElement>(
          "button.st-op",
        );
        const owner = button?.closest<HTMLElement>(".st-node");

        if (button?.dataset.node !== undefined && owner != null) {
          this.pick(
            {
              clicked: parsePathKey(button.dataset.node),
              node: parsePathKey(owner.dataset.path ?? ""),
            },
            fromKeyboard(event),
          );
        }
      });
    }

    this.restorePriorAnswer();
    this.draw();
    this.reflectVerdict();
    root.querySelector("fieldset")?.removeAttribute("aria-busy");
    this.dataset.enhanced = "true";
  }

  protected getAnswer(): { picks: Pick[] } {
    return { picks: this.picks };
  }

  /** Replay the stored picks, so a stored run that went wrong restarts. */
  private restorePriorAnswer(): void {
    const prior = this.priorAnswer as { picks?: unknown } | null;

    if (
      this.resolved === null ||
      prior === null ||
      typeof prior !== "object" ||
      !Array.isArray(prior.picks)
    ) {
      return;
    }

    for (const pick of prior.picks) {
      if (isPick(pick)) {
        this.apply(pick);
      }
    }
  }

  /**
   * Take one pick into the run: under `whole` a right one is kept and a wrong
   * one clears the run; under `partial` each sentence keeps its first. Says
   * whether the pick was right, or `null` when there was nothing to take — a
   * sentence already split, an atom, or no such sentence.
   */
  private apply(pick: Pick): boolean | null {
    if (this.resolved === null || this.data === null) {
      return null;
    }

    const tree = this.resolved.tree;
    const key = pathKey(pick.node);

    // Every pick the run holds has split its sentence, under either scoring.
    if (
      nodeAt(tree, pick.node)?.atom !== false ||
      this.picks.some((one) => pathKey(one.node) === key)
    ) {
      return null;
    }

    const right = isRightPick(tree, pick);

    if (right || this.data.scoring === "partial") {
      this.picks = [...this.picks, pick];
    } else {
      this.picks = [];
    }

    return right;
  }

  /**
   * Take a pick and redraw. Focus is moved only for a pick made from the
   * keyboard, whose user needs it put somewhere when the redraw takes the
   * pressed button away or disables the field; a mouse user points again.
   */
  private pick(pick: Pick, keyboard: boolean): void {
    const right = this.apply(pick);

    if (right === null) {
      return;
    }

    this.draw();
    this.syncAnswer();

    if (this.reflectVerdict() === "done") {
      // The connectives are gone and the field is disabled, so focus goes to
      // the message saying the tree is done, from where Tab reaches Submit.
      if (keyboard) {
        this.message?.focus();
      }

      return;
    }

    if (right || this.feedback === "none") {
      this.say("");
    } else {
      this.say(
        this.data?.scoring === "partial"
          ? this.t(
              "That is not the main connective. Here is how the sentence splits.",
            )
          : this.t("That is not the main connective. The tree starts over."),
      );
    }

    // A connective pressed in the tree was redrawn away, so focus moves on to
    // the next sentence's. A typed answer leaves focus where it was.
    if (keyboard && "clicked" in pick) {
      this.treeHost
        ?.querySelector<HTMLButtonElement>(
          ".st-node[data-target] > .st-sentence > button.st-op",
        )
        ?.focus();
    }
  }

  /** The typed answer, for the sentence marked as the field's target. */
  private submitTyped(keyboard: boolean): void {
    const resolved = this.resolved;
    const input = this.typed;
    const target =
      resolved === null || this.targetKey === null
        ? undefined
        : nodeAt(resolved.tree, parsePathKey(this.targetKey));

    if (resolved === null || input === null || target === undefined) {
      return;
    }

    const text = input.value.trim();

    if (text === "") {
      return;
    }

    const pick = typedPick(resolved.language, target, text);

    if (pick === null) {
      // Naming no connective at all is a slip, not a guess: nothing is lost,
      // and saying so gives nothing away.
      this.say(
        this.t("“{text}” is not a connective of this language.", { text }),
      );

      return;
    }

    input.value = "";
    this.pick(pick, keyboard);
  }

  /** Set the mark, and say so when the tree is finished. */
  private reflectVerdict(): "done" | "open" {
    if (this.resolved === null) {
      return "open";
    }

    const verdict = judgeSyntaxTree(this.resolved.tree, this.picks);

    if (verdict.picked < verdict.total) {
      this.setMark("idle");

      return "open";
    }

    this.setMark(verdict.ok ? "ok" : "idle");
    this.say(
      this.feedback === "none"
        ? this.t("The tree is complete.")
        : verdict.ok
          ? this.t("Every connective picked correctly.")
          : this.t("Main connectives found: {right} of {total}", {
              right: String(verdict.right),
              total: String(verdict.total),
            }),
    );

    return "done";
  }

  /**
   * Put `text` in the live region. The same words again are no change to it,
   * so a second wrong pick in a row would go unheard: the region is cleared
   * first and the words put back a moment later.
   */
  private say(text: string): void {
    const message = this.message;

    if (message === null) {
      return;
    }

    if (this.repeatHandle !== null) {
      clearTimeout(this.repeatHandle);
      this.repeatHandle = null;
    }

    if (text === "" || message.textContent !== text) {
      message.textContent = text;

      return;
    }

    message.textContent = "";
    this.repeatHandle = setTimeout(() => {
      this.repeatHandle = null;
      message.textContent = text;
    }, REPEAT_DELAY_MS);
  }

  /**
   * Draw the tree as the picks have split it, mark the sentence the field
   * answers, and leave the field usable only while one is left to answer.
   */
  private draw(): void {
    const host = this.treeHost;
    const resolved = this.resolved;
    const data = this.data;

    if (host === null || resolved === null || data === null) {
      return;
    }

    const drawn = drawnTree(
      resolved,
      splitNodes(resolved, data, this.picks),
      (id, values) => this.t(id, values),
    );
    const scroll = document.createElement("div");
    const tree = document.createElement("ul");

    this.targetKey = firstOpen(drawn);
    scroll.className = "st-scroll";
    tree.className = "st-tree";
    tree.append(this.nodeElement(drawn));
    scroll.append(tree);
    host.replaceChildren(scroll);

    const answerable = this.interactive && this.targetKey !== null;

    if (this.typed !== null) {
      this.typed.disabled = !answerable;
    }

    if (this.splitButton !== null) {
      this.splitButton.disabled = !answerable;
    }
  }

  /** One node and what is drawn under it, as `read-only-view.ts` writes it. */
  private nodeElement(node: DrawnNode): HTMLLIElement {
    const item = document.createElement("li");
    const line = document.createElement("div");

    item.className = "st-node";
    item.dataset.path = node.key;
    item.dataset.state = node.state;
    item.toggleAttribute("data-target", node.key === this.targetKey);
    line.className = "st-sentence";
    line.append(...node.runs.map((run) => this.runNode(run)));
    item.append(line);

    if (node.state === "split") {
      const children = document.createElement("ul");

      children.className = "st-children";
      children.append(
        ...node.children.map((child) => this.nodeElement(child)),
      );
      item.append(children);
    }

    return item;
  }

  private runNode(run: SentenceRun): Node {
    if (run.kind === "mark") {
      return document.createTextNode(run.text);
    }

    if (run.kind === "connective") {
      const button = document.createElement("button");

      button.className = RUN_CLASS.connective;
      button.type = "button";
      button.dataset.node = run.node;
      button.disabled = !this.interactive;
      button.textContent = run.text;

      if (run.label !== null) {
        button.setAttribute("aria-label", run.label);
      }

      return button;
    }

    const span = document.createElement("span");

    span.className = RUN_CLASS[run.kind];
    span.toggleAttribute("data-main", run.kind === "main");
    span.textContent = run.text;

    return span;
  }
}

register("carnap-syntax-tree", CarnapSyntaxTree);
