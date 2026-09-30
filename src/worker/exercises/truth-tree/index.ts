import type { ExerciseType } from "../../exercise-kit/type";
import { TRUTH_TREE_ASSESSMENT } from "./assessment";
import { compileTruthTree, truthTreeDataBodyLines } from "./authoring";
import { renderTruthTree } from "./read-only-view";
import { buildTruthTreeStrings } from "./strings";
import {
  TRUTH_TREE_ANSWER_KIND,
  TRUTH_TREE_CAPABILITIES,
  TRUTH_TREE_COMPONENT_METADATA,
  TRUTH_TREE_KIND,
  TRUTH_TREE_SCHEMA_VERSION,
  truthTreeName,
} from "./types";

/** The `::::truth-tree` exercise type, as `src/worker/exercises/index.ts` lists it. */
export const TRUTH_TREE_EXERCISE = {
  ...TRUTH_TREE_ASSESSMENT,
  answerKind: TRUTH_TREE_ANSWER_KIND,
  compile: compileTruthTree,
  component: {
    ...TRUTH_TREE_COMPONENT_METADATA,
    capabilities: TRUTH_TREE_CAPABILITIES,
  },
  dataBodyLines: truthTreeDataBodyLines,
  directiveName: "truth-tree",
  kind: TRUTH_TREE_KIND,
  name: truthTreeName,
  render: renderTruthTree,
  schemaVersion: TRUTH_TREE_SCHEMA_VERSION,
  strings: buildTruthTreeStrings,
} satisfies ExerciseType;
