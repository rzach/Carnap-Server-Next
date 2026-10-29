import type { ExerciseType } from "../../exercise-kit/type";
import { SYNTAX_TREE_ASSESSMENT } from "./assessment";
import { compileSyntaxTree } from "./authoring";
import { renderSyntaxTree } from "./read-only-view";
import { buildSyntaxTreeStrings } from "./strings";
import {
  SYNTAX_TREE_ANSWER_KIND,
  SYNTAX_TREE_CAPABILITIES,
  SYNTAX_TREE_COMPONENT_METADATA,
  SYNTAX_TREE_KIND,
  SYNTAX_TREE_SCHEMA_VERSION,
  syntaxTreeInstructions,
  syntaxTreeName,
} from "./types";

/** The `:::syntax-tree` exercise type, as `src/worker/exercises/index.ts` lists it. */
export const SYNTAX_TREE_EXERCISE = {
  ...SYNTAX_TREE_ASSESSMENT,
  answerKind: SYNTAX_TREE_ANSWER_KIND,
  compile: compileSyntaxTree,
  component: {
    ...SYNTAX_TREE_COMPONENT_METADATA,
    capabilities: SYNTAX_TREE_CAPABILITIES,
  },
  directiveName: "syntax-tree",
  instructions: syntaxTreeInstructions,
  kind: SYNTAX_TREE_KIND,
  name: syntaxTreeName,
  render: renderSyntaxTree,
  schemaVersion: SYNTAX_TREE_SCHEMA_VERSION,
  strings: buildSyntaxTreeStrings,
} satisfies ExerciseType;
