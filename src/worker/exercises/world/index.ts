import type { ExerciseType } from "../../exercise-kit/type";
import { WORLD_ASSESSMENT } from "./assessment";
import { compileWorld, worldDataBodyLines } from "./authoring";
import { renderWorld } from "./read-only-view";
import { buildWorldStrings } from "./strings";
import {
  WORLD_ANSWER_KIND,
  WORLD_CAPABILITIES,
  WORLD_COMPONENT_METADATA,
  WORLD_KIND,
  WORLD_SCHEMA_VERSION,
  worldName,
} from "./types";

/** The `:::world` exercise type, as `src/worker/exercises/index.ts` lists it. */
export const WORLD_EXERCISE = {
  ...WORLD_ASSESSMENT,
  answerKind: WORLD_ANSWER_KIND,
  compile: compileWorld,
  component: {
    ...WORLD_COMPONENT_METADATA,
    capabilities: WORLD_CAPABILITIES,
  },
  dataBodyLines: worldDataBodyLines,
  directiveName: "world",
  kind: WORLD_KIND,
  name: worldName,
  render: renderWorld,
  schemaVersion: WORLD_SCHEMA_VERSION,
  strings: buildWorldStrings,
} satisfies ExerciseType;
