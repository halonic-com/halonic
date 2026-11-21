import type { WorkflowArrow } from "../api.ts";

/**
 * For each of a step's arrows, in file order, the place (from 1) of the earlier arrow that always
 * matches first, so this one is never taken; `undefined` for an arrow that can be. The first arrow
 * on an event without a condition matches every time that event comes, so any later arrow on the
 * same event is never reached. A timer (`after`) isn't an event and hides nothing.
 *
 * This is the core's `unguarded-shadow` check, which Configuration › Problems lists; the card
 * applies it to its own rows, so it can say it on the arrow's row and right after a change.
 */
export function neverTaken(arrows: readonly WorkflowArrow[]): readonly (number | undefined)[] {
  // The first arrow without a condition on each event, by its place from 1.
  const alwaysMatches = new Map<string, number>();
  return arrows.map((arrow, index) => {
    if (arrow.after !== undefined) return undefined;
    const event = arrow.event ?? "done";
    const earlier = alwaysMatches.get(event);
    if (earlier === undefined && arrow.condition === undefined) alwaysMatches.set(event, index + 1);
    return earlier;
  });
}
