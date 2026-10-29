/**
 * `<carnap-syntax-tree>` — split a sentence by its main connectives until only
 * atomic sentences remain (gh #38, old Carnap's `.SynChecker .Match`); at
 * `depth="terms"`, on through the atoms' terms to variables and names, linking
 * each variable to the quantifier that binds it.
 *
 * The server renders the sentence into a Declarative Shadow Root with its
 * connectives as disabled buttons (`renderSyntaxTreeElement`). On connect this
 * element replays the prior picks, enables the buttons of every sentence still
 * to split, and redraws the tree after each pick. A student presses a
 * connective in any unsplit sentence, with the mouse or from the keyboard;
 * the instructions, and the keys, are in the (?) panel in the action bar.
 *
 * A variable still to link is a button too. Pressing it makes every
 * quantifier in the tree a button, not only those above it, and shows Free;
 * pressing one of those links it, and Escape, or the variable again, lets it
 * go.
 *
 * Under `scoring="whole"` a wrong pick starts the tree over: the rule that
 * keeps a student from clicking every connective in turn. The restart is
 * itself a verdict, so it happens under every `feedback`; only the sentence
 * explaining it is withheld under `none`. Under `scoring="partial"` each
 * sentence takes one pick and then shows its true split, right or wrong. A
 * link is a pick like any other.
 *
 * The tree, the picks and their verdicts all come from the same DOM-free core
 * the server grades with (`exercises/syntax-tree/logic/tree.ts`), and what is
 * drawn from `display.ts`, which the server view writes out too. The lines
 * joining the nodes, and each variable to its quantifier, are the one thing
 * only the element draws (`syntax-tree-lines.ts`), so a review loads this
 * module to draw them over the tree the server wrote.
 */

import type {
  DrawnNode,
  SentenceRun,
} from "../../worker/exercises/syntax-tree/display";
import {
  drawnTree,
  RUN_CLASS,
  shownAnswers,
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
  asksFor,
  isRightPick,
  nodeAt,
  parsePathKey,
  pathKey,
} from "../../worker/exercises/syntax-tree/logic/tree";
import type { SyntaxTreeStringId } from "../../worker/exercises/syntax-tree/strings";
import type { SyntaxTreePublicData } from "../../worker/exercises/syntax-tree/types";
import { SYNTAX_TREE_DEPTH_WORDS } from "../../worker/exercises/syntax-tree/words";
import { CarnapExerciseElement, register } from "./base";
import {
  createHelpDialog,
  HELP_DIALOG_STYLES,
  type HelpShortcut,
  mountHelpTrigger,
  openHelpDialog,
} from "./help-dialog";
import { pageShortcutKey, pageShortcutRows } from "./shortcut-keys";
import { drawLines } from "./syntax-tree-lines";

/**
 * How long a repeated message stays cleared before it is said again: long
 * enough for a screen reader to take the empty region as a change.
 */
const REPEAT_DELAY_MS = 100;

/** Every button that answers something, in the order a keyboard meets them. */
const ANSWER_BUTTONS = `button.${RUN_CLASS.connective}, button.${RUN_CLASS.variable}`;

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
  private freeButton: HTMLButtonElement | null = null;
  private helpDialog: HTMLDialogElement | null = null;
  private interactive = false;
  /** The key of the variable being linked, between its press and its link. */
  private linking: string | null = null;
  private repeatHandle: ReturnType<typeof setTimeout> | null = null;

  protected override get gradesLocally(): boolean {
    return true;
  }

  protected enhance(): void {
    const root = this.shadowRoot;

    if (root === null) {
      return;
    }

    this.treeHost = root.querySelector<HTMLElement>('[data-role="tree"]');
    this.watchLayout();

    const data = this.publicData;

    // A review sends no public data: the server drew the tree as submitted,
    // and the lines are all there is to add.
    if (!isSyntaxTreePublicData(data)) {
      this.redrawLines();
      this.dataset.enhanced = "true";

      return;
    }

    this.data = data;
    this.resolved = resolveSyntaxTree(data);
    this.message = root.querySelector<HTMLElement>('[data-role="message"]');
    this.freeButton = root.querySelector<HTMLButtonElement>(
      '[data-role="free"]',
    );
    this.interactive = this.mode === "answer" && this.resolved !== null;

    if (this.interactive) {
      this.treeHost?.addEventListener("click", (event) =>
        this.onTreeClick(event),
      );
      this.freeButton?.addEventListener("click", (event) =>
        this.link(null, fromKeyboard(event)),
      );
      root.addEventListener("keydown", (event) =>
        this.onKey(event as KeyboardEvent),
      );
      this.mountHelp(root, data);
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

  /**
   * Redraw the lines whenever the tree's box changes: a web font arriving,
   * a narrower window, the tree coming into view from a closed `<details>`.
   */
  private watchLayout(): void {
    const host = this.treeHost;

    if (host === null || typeof ResizeObserver === "undefined") {
      return;
    }

    new ResizeObserver(() => this.redrawLines()).observe(host);
  }

  private redrawLines(): void {
    const scroll = this.treeHost?.querySelector<HTMLElement>(".st-scroll");

    if (scroll != null) {
      drawLines(scroll);
    }
  }

  /**
   * Escape lets go of the variable being linked; `?` opens the help, as a
   * single-key shortcut (`pageShortcutKey`). Neither while the help is open,
   * whose own Escape closes it.
   */
  private onKey(event: KeyboardEvent): void {
    if (this.helpDialog?.open === true) {
      return;
    }

    if (event.key === "Escape" && this.linking !== null) {
      event.preventDefault();
      this.stopLinking(true);
    } else if (pageShortcutKey(event) === "?" && this.helpDialog !== null) {
      event.preventDefault();
      openHelpDialog(this.helpDialog, event.target as HTMLElement);
    }
  }

  /**
   * The (?) in the action bar, and the panel it opens: what to do, how a
   * wrong pick is scored, and the keys. Only where there is something to do.
   */
  private mountHelp(root: ShadowRoot, data: SyntaxTreePublicData): void {
    const words = SYNTAX_TREE_DEPTH_WORDS[data.depth];
    const terms = data.depth === "terms";
    const shortcuts: readonly {
      readonly action: SyntaxTreeStringId;
      readonly keys: readonly string[];
    }[] = [
      { action: "Move between the buttons", keys: ["Tab", "Shift-Tab"] },
      { action: "Press the button under focus", keys: ["Enter", "Space"] },
      ...(terms
        ? [
            {
              action: "Let go of the variable being linked" as const,
              keys: ["Esc"],
            },
          ]
        : []),
      { action: "Open this help", keys: ["?"] },
    ];
    const style = document.createElement("style");

    style.textContent = HELP_DIALOG_STYLES;
    this.helpDialog = createHelpDialog({
      close: this.t("Close help"),
      intro: [
        words.instructions,
        words.boxes,
        ...(terms
          ? [
              "To link a variable, press it, then press the quantifier that binds it, or Free if none does." as const,
            ]
          : []),
        data.scoring === "partial"
          ? ("Each sentence takes one pick. After a wrong one, the tree shows how it really splits." as const)
          : ("A wrong pick starts the tree over." as const),
      ].map((id) => this.t(id)),
      keyboard: this.t("Keyboard"),
      shortcuts: pageShortcutRows(
        shortcuts.map(
          (shortcut): HelpShortcut => ({
            action: this.t(shortcut.action),
            keys: shortcut.keys,
          }),
        ),
      ),
      title: this.t("Splitting a syntax tree"),
    });
    root.append(style, this.helpDialog);
    mountHelpTrigger(
      this,
      this.t("Usage and keyboard shortcuts"),
      (trigger) => {
        if (this.helpDialog !== null) {
          openHelpDialog(this.helpDialog, trigger);
        }
      },
    );
  }

  private onTreeClick(event: MouseEvent): void {
    const button = (event.target as Element | null)?.closest<HTMLElement>(
      "button[data-node]",
    );
    const key = button?.dataset.node;

    if (button == null || key === undefined) {
      return;
    }

    const keyboard = fromKeyboard(event);

    if (button.classList.contains(RUN_CLASS.variable)) {
      if (this.linking === key) {
        this.stopLinking(keyboard);
      } else {
        this.startLinking(key, keyboard);
      }
    } else if (button.classList.contains(RUN_CLASS.binder)) {
      this.link(parsePathKey(key), keyboard);
    } else {
      const owner = button.closest<HTMLElement>(".st-node");

      this.pick(
        {
          clicked: parsePathKey(key),
          node: parsePathKey(owner?.dataset.path ?? ""),
        },
        keyboard,
      );
    }
  }

  /** Press a variable: the quantifiers become buttons, and Free appears. */
  private startLinking(key: string, keyboard: boolean): void {
    const variable = this.resolved?.tree.byPath.get(key);

    if (variable === undefined) {
      return;
    }

    this.linking = key;
    this.draw();
    this.say(
      this.t("Pick the quantifier that binds {variable}, or Free.", {
        variable: variable.text,
      }),
    );

    // From the keyboard, to the first quantifier, or to Free when the tree
    // has none.
    if (keyboard) {
      (
        this.treeHost?.querySelector<HTMLButtonElement>(
          `button.${RUN_CLASS.binder}`,
        ) ?? this.freeButton
      )?.focus();
    }
  }

  /** Let the variable go unlinked; from the keyboard, back to its button. */
  private stopLinking(keyboard: boolean): void {
    const key = this.linking;

    this.linking = null;
    this.draw();
    this.say("");

    if (keyboard && key !== null) {
      this.treeHost
        ?.querySelector<HTMLButtonElement>(
          `button.${RUN_CLASS.variable}[data-node="${key}"]`,
        )
        ?.focus();
    }
  }

  /** Link the variable being linked to a quantifier node, or to none. */
  private link(binder: number[] | null, keyboard: boolean): void {
    const key = this.linking;

    if (key === null) {
      return;
    }

    this.linking = null;
    this.pick({ linked: binder, node: parsePathKey(key) }, keyboard);
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
   * one clears the run; under `partial` each node keeps its first. Says
   * whether the pick was right, or `null` when there was nothing to take — a
   * node already answered, one that asks for no such answer, or no node.
   */
  private apply(pick: Pick): boolean | null {
    if (this.resolved === null || this.data === null) {
      return null;
    }

    const tree = this.resolved.tree;
    const key = pathKey(pick.node);
    const node = nodeAt(tree, pick.node);

    // Every pick the run holds has settled its node, under either scoring.
    if (
      node === undefined ||
      !asksFor(node, pick) ||
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

    // Drawn either way: a link that took nothing still ended the linking.
    this.draw();

    if (right === null) {
      return;
    }

    this.syncAnswer();

    if (this.reflectVerdict() === "done") {
      // The buttons are gone and the field is disabled, so focus goes to the
      // message saying the tree is done, from where Tab reaches Submit.
      if (keyboard) {
        this.message?.focus();
      }

      return;
    }

    this.say(
      right || this.feedback === "none" ? "" : this.wrongMessage(pick),
    );

    // The button pressed was redrawn away, so focus moves on to the next
    // thing to answer.
    if (keyboard) {
      this.treeHost
        ?.querySelector<HTMLButtonElement>(ANSWER_BUTTONS)
        ?.focus();
    }
  }

  /** What a wrong pick is told, by what it was and how the tree is scored. */
  private wrongMessage(pick: Pick): string {
    const partial = this.data?.scoring === "partial";

    if ("linked" in pick) {
      return partial
        ? this.t("That is not how this variable is bound. Here is how it is.")
        : this.t(
            "That is not how this variable is bound. The tree starts over.",
          );
    }

    const words = SYNTAX_TREE_DEPTH_WORDS[this.data?.depth ?? "connectives"];

    return this.t(partial ? words.wrongPartial : words.wrongWhole);
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

    const words = SYNTAX_TREE_DEPTH_WORDS[this.resolved.tree.depth];

    this.setMark(verdict.ok ? "ok" : "idle");
    this.say(
      this.feedback === "none"
        ? this.t("The tree is complete.")
        : verdict.ok
          ? this.t(words.allRight)
          : this.t(words.count, {
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
   * Draw the tree as the picks have split and linked it, and show Free only
   * while a variable is being linked.
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
      shownAnswers(resolved, data, this.picks),
      (id, values) => this.t(id, values),
      this.linking,
    );
    const scroll = document.createElement("div");
    const tree = document.createElement("ul");

    scroll.className = "st-scroll";
    tree.className = "st-tree";
    tree.append(this.nodeElement(drawn));
    scroll.append(tree);
    host.replaceChildren(scroll);
    drawLines(scroll);

    if (this.freeButton !== null) {
      this.freeButton.hidden = this.linking === null;
    }
  }

  /** One node and what is drawn under it, as `read-only-view.ts` writes it. */
  private nodeElement(node: DrawnNode): HTMLLIElement {
    const item = document.createElement("li");
    const line = document.createElement("div");

    item.className = "st-node";
    item.dataset.path = node.key;
    item.dataset.state = node.state;

    if (node.link?.boundBy != null) {
      item.dataset.boundBy = node.link.boundBy;
    }

    line.className = "st-sentence";
    line.append(...node.runs.map((run) => this.runNode(run)));
    item.append(line);

    if (node.link !== null) {
      const note = document.createElement("span");

      note.className =
        node.link.boundBy === null
          ? "st-link-note"
          : "st-link-note visually-hidden";
      note.textContent = node.link.note;
      item.append(note);
    }

    // Under partial a miss is drawn split the true way like any other pick,
    // so without this mark a finished tree reads as all right whatever its
    // count says. Which sentence was missed is detail `terse` withholds.
    if (node.missed !== null && this.feedback === "full") {
      item.dataset.missed = "";

      if (node.missed.note.length > 0) {
        const note = document.createElement("span");

        note.className = "st-missed-note visually-hidden";
        note.textContent = node.missed.note;
        item.append(note);
      }
    }

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

    if (
      run.kind === "binder" ||
      run.kind === "connective" ||
      run.kind === "variable"
    ) {
      const button = document.createElement("button");

      button.className = RUN_CLASS[run.kind];
      button.type = "button";
      button.dataset.node = run.node;
      button.disabled = !this.interactive;
      button.textContent = run.text;
      button.toggleAttribute("data-main", run.kind === "binder");

      if (run.kind === "variable") {
        button.setAttribute("aria-pressed", String(run.pressed));
      }

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
