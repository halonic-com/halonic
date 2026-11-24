/**
 * Review findings by severity tag (docs/guides/review.md), counted from
 * reviewers' review and comment bodies while the snapshot is taken. Only the
 * counts are kept: no body text ever reaches the snapshot (HAL-17604).
 */

/** How many findings carry each tag. */
export interface SeverityCounts {
  readonly blocker: number;
  readonly major: number;
  readonly minor: number;
  readonly nit: number;
}

const tagLine = /^\s*(?:[-*]\s+)?\[(blocker|major|minor|nit)\]/gim;

/** Counts one finding per tagged line, over all the bodies. */
export function severityCounts(bodies: readonly (string | null | undefined)[]): SeverityCounts {
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const body of bodies) {
    for (const match of (body ?? "").matchAll(tagLine)) {
      const tag = (match[1] ?? "").toLowerCase() as keyof SeverityCounts;
      counts[tag] += 1;
    }
  }
  return counts;
}

/**
 * Cuts GitHub-written or queue-written text to `cap` characters, ending in
 * "…" when it was longer. Used for titles, check names and dequeue reasons,
 * so a long or hostile value can't grow the snapshot or an answer.
 */
export function capped(text: string, cap: number): string {
  return text.length <= cap ? text : `${text.slice(0, cap - 1)}…`;
}
