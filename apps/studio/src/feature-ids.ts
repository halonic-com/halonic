import { features } from "./generated/features.ts";

/**
 * The ids of every feature the Studio is built with, from the generated
 * feature list. The shell takes over registration in the
 * Studio track; until then this proves the list is wired up.
 */
export function featureIds(): string[] {
  return features.map((feature) => feature.id);
}
