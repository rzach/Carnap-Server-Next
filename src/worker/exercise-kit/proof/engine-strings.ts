import { placeholders, type Translator } from "../../i18n/translator";

/**
 * The text every proof widget — linear `.auf`, Fitch, tree and Prawitz — has
 * to be able to say, because they all drive the same WASM compiler through
 * the same pipeline (the client's `components/proof-element.ts`): the engine
 * failing, the proof it could not read, a playground with no readable goal,
 * and the `allow-sorry` protocol. The Prawitz widget cannot admit a line
 * (its `enhance` says why), so the last of those never fires there — but the
 * gate that would say it is the one it shares.
 *
 * The verdict itself is not here: it is the shared correctness mark in the
 * action bar, which the server renders with the names for all four of its
 * states on it, so no widget carries text for it. Nor is text that only some
 * of the four read — the `Prove` label, the two CodeMirror editors' fallback
 * for a diagnostic with no message, Fitch's read-only review editor — which
 * each of those widgets' own `strings.ts` carries, so a widget ships only the
 * ids it looks up. Ids are the English text, so a sentence two of them share
 * is still one catalog entry.
 *
 * The compiler's own diagnostics are mostly not here. The errors students
 * meet are, worded by the engine's code (#394); every other code keeps the
 * engine's headline, which is translated upstream, not by us —
 * `@aufbau/compiler` carries its own catalogs and picks one from the locale
 * `client/proof-compiler.ts` hands it, so a language Aufbau has not translated
 * reaches the student's editor gutter in English however complete our own
 * catalog is.
 */
export function buildProofEngineStrings(i18n: Translator) {
  return {
    /**
     * Why the Submit button did nothing, under `allow-sorry` outside an exam.
     * Not a verdict, so it shows whatever the feedback setting says.
     */
    "A proof with lines admitted with sorry! cannot be submitted.": i18n.t(
      "A proof with lines admitted with sorry! cannot be submitted.",
    ),
    "Could not load the proof engine.": i18n.t(
      "Could not load the proof engine.",
    ),
    /**
     * The status line under `allow-sorry` when the only problems left are the
     * admissions themselves — on an exam, where the proof may be handed in as
     * it stands. Detail, so `full` feedback only.
     */
    "Every other line checks; lines admitted with sorry! do not score.":
      i18n.t(
        "Every other line checks; lines admitted with sorry! do not score.",
      ),
    /** The same status outside an exam, where the widget holds the proof back. */
    "Every other line checks; a proof with lines admitted with sorry! cannot be submitted.":
      i18n.t(
        "Every other line checks; a proof with lines admitted with sorry! cannot be submitted.",
      ),
    /**
     * A playground's mark when the proof has a last line but the theory
     * cannot say which of its tokens are variables, so no goal can be
     * declared for it (see `./playground.ts`).
     */
    "Could not work out what the last line states.": i18n.t(
      "Could not work out what the last line states.",
    ),
    /**
     * Said aloud when F8 or Shift-F8 finds no line with a problem to step to,
     * and listed in the CodeMirror editors' problem panel when it is empty.
     */
    "No errors.": i18n.t("No errors."),
    /**
     * A playground's goal row while the proof states nothing — empty, or not
     * yet one derivation whose conclusion can be read.
     */
    "Enter a proof": i18n.t("Enter a proof"),
    /** Label on a playground's goal row, before the sequent the proof derives. */
    Proves: i18n.t("Proves"),
    "The proof engine couldn't read this proof — check for unexpected characters.":
      i18n.t(
        "The proof engine couldn't read this proof — check for unexpected characters.",
      ),
    /**
     * The engine's errors, worded for the student by the engine's code (see
     * `client/components/proof-element.ts`). Each is shown on the line or
     * node it is about, which is what "this" is, and says what is wrong
     * without saying how to fix it. `{rule}` is the rule as the proof cites
     * it (∧I, not and_intro). A line the rule does not fit has the rule's
     * shape drawn under its message, premises first, so the count is there.
     */
    "{rule} takes a different number of premises.": i18n.t(
      "{rule} takes a different number of premises.",
      placeholders("rule"),
    ),
    "This does not follow by {rule}.": i18n.t(
      "This does not follow by {rule}.",
      placeholders("rule"),
    ),
    /** On the proof's last line, or the root of a tree. */
    "This does not prove the goal: its conclusion or its assumptions differ from the goal's.":
      i18n.t(
        "This does not prove the goal: its conclusion or its assumptions differ from the goal's.",
      ),
    /**
     * A rule's condition on a name broken: ∀I's eigenvariable occurs in an
     * assumption the line depends on, say. `{name}` is the name, drawn in
     * code type.
     */
    "The name {name} does not meet {rule}'s restriction.": i18n.t(
      "The name {name} does not meet {rule}'s restriction.",
      placeholders("name", "rule"),
    ),
    /** A line admitted with sorry! where the exercise does not allow it. */
    "This exercise does not allow sorry!.": i18n.t(
      "This exercise does not allow sorry!.",
    ),
  };
}

/** What every proof widget can say; the shared pipeline's `t` is typed to it. */
export type ProofEngineStringId = keyof ReturnType<
  typeof buildProofEngineStrings
>;

/**
 * What the three widgets that read a theory's rule names — Fitch, tree and
 * Prawitz — say of a citation the theory has no rule by (gh #53). The linear
 * editor's proof is the engine's own text, citations and all, so the engine
 * words that one itself.
 */
export function buildRuleCitationStrings(i18n: Translator) {
  return {
    "There is no rule called “{rule}”.": i18n.t(
      "There is no rule called “{rule}”.",
      placeholders("rule"),
    ),
  };
}
