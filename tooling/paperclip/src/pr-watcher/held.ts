import type { HeldRun } from "../merge-control/state.ts";
import type { PullFacts } from "./decide.ts";

/**
 * The culprit of a failed merge group (HAL-18147). Merge control holds the
 * pull request's head until it has a new one and keeps why in its state
 * (`failedHeads`, `heldRuns`); the watcher reads that state, sends no GitHub
 * request for it, and wakes the author's task once per held head.
 */

/** A head merge control holds after its merge group failed. */
export interface HeldHead extends HeldRun {
  readonly repo: string;
  readonly number: number;
}

/** The parts of merge control's stored entry this reads; anything else is left alone. */
interface StoredHolds {
  readonly version?: unknown;
  readonly state?: {
    readonly version?: unknown;
    readonly failedHeads?: Readonly<Record<string, string>>;
    readonly heldRuns?: Readonly<Record<string, HeldRun>>;
  };
}

/**
 * The heads merge control holds in `repo`, from its stored entry. None
 * before its first pass, for another version, or for a hold without its run
 * (one set before HAL-18147): there is no check to name.
 */
export function heldHeads(stored: unknown, repo: string): HeldHead[] {
  const entry = stored as StoredHolds | null;
  if (entry?.version !== 1 || entry.state?.version !== 1) {
    return [];
  }
  const failedHeads = entry.state.failedHeads ?? {};
  return Object.entries(entry.state.heldRuns ?? {})
    .filter(([number, run]) => failedHeads[number] === run.head)
    .map(([number, run]) => ({ ...run, repo, number: Number(number) }));
}

/** The pull requests, each open one whose current head is held marked with why. */
export function withHeld(
  pulls: readonly PullFacts[],
  held: readonly HeldHead[],
): readonly PullFacts[] {
  return pulls.map((pull) => {
    const hold = held.find(
      (each) =>
        each.repo.toLowerCase() === pull.repo.toLowerCase() &&
        each.number === pull.number &&
        each.head === pull.head,
    );
    if (pull.state !== "open" || hold === undefined) {
      return pull;
    }
    return { ...pull, held: { url: hold.url, jobs: hold.jobs, error: hold.error } };
  });
}
