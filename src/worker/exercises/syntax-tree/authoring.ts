import { printTerm, UnprintableTermError } from "@aufbau/syntax";
import {
  type CompilerDiagnostic,
  diagnostic,
} from "../../application/content/diagnostics";
import { renderMarkdownSource } from "../../application/content/markdown";
import {
  buildCompiledExercise,
  COMMON_EXERCISE_ATTRIBUTES,
  type CompiledExercise,
  type DirectiveBlock,
  parseExamAttribute,
  parsePoints,
  reconcileFeedback,
  requireAttribute,
  validateAttributes,
  validateExerciseId,
} from "../../exercise-kit/authoring";
import { parseSystemAttribute } from "../../exercise-kit/systems/attribute";
import type { ExerciseCompileContext } from "../../exercise-kit/type";
import { formulaParseErrors } from "../../logic/specs/diagnostics";
import type { SyntaxTreeDepth } from "./logic/tree";
import {
  pickableCount,
  readingSort,
  SYNTAX_TREE_DEPTHS,
  syntaxTree,
} from "./logic/tree";
import type { SyntaxTreePublicData, SyntaxTreeScoring } from "./types";
import {
  SYNTAX_TREE_ANSWER_KIND,
  SYNTAX_TREE_CAPABILITIES,
  SYNTAX_TREE_COMPONENT_METADATA,
  SYNTAX_TREE_KIND,
  SYNTAX_TREE_SCHEMA_VERSION,
  SYNTAX_TREE_SCORINGS,
} from "./types";

/** A sentence line: `- P /\ (Q -> R)`, as a truth table lists its formulas. */
const SENTENCE_LINE = /^\s*-\s+(.+?)\s*$/;

/** What `:::syntax-tree{…}` accepts beyond the shared exercise set. */
const SYNTAX_TREE_ATTRIBUTES = [
  ...COMMON_EXERCISE_ATTRIBUTES,
  "depth",
  "scoring",
  "system",
] as const;

/** The language a tree is set in when the author names none. */
const DEFAULT_SYSTEM = "carnap-prop";

function parseScoring(
  value: string | undefined,
  line: number,
  diagnostics: CompilerDiagnostic[],
): SyntaxTreeScoring {
  const scoring = value?.trim();

  if (scoring === undefined || scoring === "") {
    return "whole";
  }

  if (SYNTAX_TREE_SCORINGS.includes(scoring as SyntaxTreeScoring)) {
    return scoring as SyntaxTreeScoring;
  }

  diagnostics.push(
    diagnostic(
      line,
      "invalid_syntax_tree_scoring",
      "The scoring attribute must be whole or partial.",
    ),
  );

  return "whole";
}

function parseDepth(
  value: string | undefined,
  line: number,
  diagnostics: CompilerDiagnostic[],
): SyntaxTreeDepth {
  const depth = value?.trim();

  if (depth === undefined || depth === "") {
    return "connectives";
  }

  if (SYNTAX_TREE_DEPTHS.includes(depth as SyntaxTreeDepth)) {
    return depth as SyntaxTreeDepth;
  }

  diagnostics.push(
    diagnostic(
      line,
      "invalid_syntax_tree_depth",
      "The depth attribute must be connectives or terms.",
    ),
  );

  return "connectives";
}

/**
 * Prose up to the sentence is the prompt; the sentence is the one list item,
 * and nothing may follow it.
 */
function parseBody(
  block: DirectiveBlock,
  diagnostics: CompilerDiagnostic[],
): {
  promptLines: string[];
  sentence: { line: number; text: string } | null;
} {
  const promptLines: string[] = [];
  let sentence: { line: number; text: string } | null = null;

  for (const [index, line] of block.bodyLines.entries()) {
    const lineNumber = block.bodyStartLine + index;
    const match = SENTENCE_LINE.exec(line);

    if (sentence === null && match === null) {
      promptLines.push(line);
    } else if (sentence === null) {
      sentence = { line: lineNumber, text: match?.[1] ?? "" };
    } else if (line.trim().length > 0) {
      diagnostics.push(
        diagnostic(
          lineNumber,
          "invalid_syntax_tree_body",
          "A syntax tree exercise takes one sentence, as a list item, and nothing after it.",
        ),
      );
    }
  }

  if (sentence === null) {
    diagnostics.push(
      diagnostic(
        block.line,
        "missing_syntax_tree_sentence",
        "A syntax tree exercise needs a sentence to decompose, written as a list item: “- P ∧ Q”.",
      ),
    );
  }

  return { promptLines, sentence };
}

export async function compileSyntaxTree(
  block: DirectiveBlock,
  context: ExerciseCompileContext,
): Promise<CompiledExercise | null> {
  const { diagnostics, renderOptions, resolveSystem } = context;
  validateAttributes(block, SYNTAX_TREE_ATTRIBUTES, diagnostics);

  const id = requireAttribute(block, "id", diagnostics);
  const points = parsePoints(block.attrs.points, block.line, diagnostics);
  const title = block.attrs.title?.trim();
  const exam = parseExamAttribute(block.attrs.exam, block.line, diagnostics);
  const feedback = reconcileFeedback(block, undefined, diagnostics);
  const scoring = parseScoring(block.attrs.scoring, block.line, diagnostics);
  const depth = parseDepth(block.attrs.depth, block.line, diagnostics);
  const before = diagnostics.length;
  const { language, system } = parseSystemAttribute(
    block,
    resolveSystem,
    diagnostics,
    { defaultId: DEFAULT_SYSTEM },
  );
  const resolvedSystem = diagnostics.length === before;
  const body = parseBody(block, diagnostics);

  if (id === null || !resolvedSystem || body.sentence === null) {
    return null;
  }

  validateExerciseId(block, id, diagnostics);

  // Down to the atoms, the tree's nodes are the nodes of this sort, and the
  // stored sentence is read back at it: without one there is nothing to draw.
  // Through the terms every node is drawn, so any sort the text reads at will
  // do, and a language of terms alone has trees too.
  const sort = readingSort(language, depth);

  if (sort === null) {
    diagnostics.push(
      diagnostic(
        block.line,
        "missing_syntax_tree_sentence_sort",
        'System “{system}” declares no “@syntax role sentence”, which a syntax tree needs to tell its sentences from their parts. Put the annotation on the sort of formulas, or draw the tree through its terms with depth="terms", which needs none.',
        { params: { system } },
      ),
    );

    return null;
  }

  const parsed = language.parse(
    body.sentence.text,
    sort === undefined ? {} : { sort },
  );

  if (!parsed.ok) {
    diagnostics.push(
      diagnostic(
        body.sentence.line,
        "invalid_formula",
        "Could not parse formula “{formula}”: {detail}",
        {
          params: {
            detail: formulaParseErrors(parsed.diagnostics)[0] ?? {
              message: "syntax error",
            },
            formula: body.sentence.text,
          },
        },
      ),
    );

    return null;
  }

  let tree: ReturnType<typeof syntaxTree>;

  try {
    tree = syntaxTree(language, parsed.term, depth);
  } catch (error) {
    // A term the language reads but cannot write back has no lines to draw.
    if (error instanceof UnprintableTermError) {
      diagnostics.push(
        diagnostic(
          body.sentence.line,
          "unprintable_syntax_tree_sentence",
          "The sentence “{formula}” reads, but the language cannot print all of its parts, so its tree cannot be drawn.",
          { params: { formula: body.sentence.text } },
        ),
      );

      return null;
    }

    throw error;
  }

  if (pickableCount(tree) === 0) {
    diagnostics.push(
      diagnostic(
        body.sentence.line,
        "atomic_syntax_tree_sentence",
        "The sentence “{formula}” is atomic, so there is nothing to decompose.",
        { params: { formula: body.sentence.text } },
      ),
    );

    return null;
  }

  const publicData: SyntaxTreePublicData = {
    depth,
    promptHtml: await renderMarkdownSource(body.promptLines.join("\n"), {
      ...renderOptions,
      lineOffset: block.bodyStartLine - 1,
    }),
    scoring,
    sentence: printTerm(language, parsed.term, "engine"),
    system,
  };

  return buildCompiledExercise({
    answerKind: SYNTAX_TREE_ANSWER_KIND,
    capabilities: SYNTAX_TREE_CAPABILITIES,
    exam,
    feedback,
    id,
    kind: SYNTAX_TREE_KIND,
    nominalPoints: points,
    privateData: {},
    publicData,
    render: SYNTAX_TREE_COMPONENT_METADATA,
    schemaVersion: SYNTAX_TREE_SCHEMA_VERSION,
    title,
  });
}
