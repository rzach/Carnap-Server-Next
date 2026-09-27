import { BLOCKS_KIND } from "./blocks";
import type { WorldKind } from "./contract";

/**
 * Every world kind, once. As with the exercise types, this list is the
 * whole registration: authoring looks a kind up by `world=`, grading by the
 * id stored with the exercise, and nothing else enumerates them.
 */
export const WORLD_KINDS: readonly WorldKind[] = [BLOCKS_KIND];

/** What `world=` means when an author leaves it out — permanently. */
export const DEFAULT_WORLD_KIND = "blocks";

export function worldKindById(id: string): WorldKind | null {
  return WORLD_KINDS.find((kind) => kind.id === id) ?? null;
}
