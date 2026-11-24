import { fastTrackLabel } from "../../pr-tools/queue-state.ts";
import { groupPull } from "../culprit.ts";
import type { PassRecord } from "../record/record.ts";
import type { GatePull } from "../snapshot.ts";
import { measuredTimings, minutesBetween, type SimDay, type SimPull } from "./day.ts";

/**
 * A recorded day for the simulator, from the recorder's passes: each pull
 * request's first ready pass, its label, its failed group and conflict, and
 * the day's group build time, refix time and build limit.
 */

interface Seen {
  readyAt: string;
  fastTrack: boolean;
  failedAt: string | null;
  failedHead: string | null;
  readyAgainAt: string | null;
  conflictsAt: string | null;
  files: readonly string[];
}

/** A pull request seen before: when it conflicted in the queue, and when a new head after its failure was ready. */
function follow(known: Seen, pull: GatePull, queued: boolean, record: PassRecord): void {
  if (queued && pull.mergeable === "CONFLICTING") {
    known.conflictsAt ??= record.at;
  }
  const newHead = known.failedHead !== null && pull.head !== known.failedHead;
  if (newHead && known.readyAgainAt === null && record.ready.includes(pull.number)) {
    known.readyAgainAt = record.at;
  }
}

function observe(seen: Map<number, Seen>, record: PassRecord): void {
  for (const pull of record.snapshot.pulls) {
    const queued = record.snapshot.queue.some((entry) => entry.number === pull.number);
    const known = seen.get(pull.number);
    if (known !== undefined) {
      follow(known, pull, queued, record);
    } else if (record.ready.includes(pull.number) && !queued) {
      seen.set(pull.number, {
        readyAt: record.at,
        fastTrack: pull.labels.includes(fastTrackLabel),
        failedAt: null,
        failedHead: null,
        readyAgainAt: null,
        conflictsAt: null,
        files: pull.files,
      });
    }
  }
  for (const run of record.snapshot.groupRuns.filter((each) => each.conclusion === "failure")) {
    const number = groupPull(run.branch) ?? 0;
    const known = seen.get(number);
    if (known !== undefined && known.failedAt === null && run.createdAt >= known.readyAt) {
      known.failedAt = run.createdAt;
      known.failedHead = record.snapshot.pulls.find((pull) => pull.number === number)?.head ?? null;
    }
  }
}

/** The day `date` from its recorded passes, in order. */
export function dayFromRecords(date: string, records: readonly PassRecord[]): SimDay {
  const seen = new Map<number, Seen>();
  const enqueued = new Map<number, string>();
  const building: number[] = [];
  const enqueueToMerge: number[] = [];
  for (const record of records) {
    observe(seen, record);
    building.push(
      record.snapshot.queue.filter((entry) => entry.state === "AWAITING_CHECKS").length,
    );
    for (const entry of record.snapshot.queue) {
      enqueued.set(entry.number, entry.enqueuedAt);
    }
    for (const merged of record.snapshot.merged) {
      const at = enqueued.get(merged.number);
      if (at !== undefined) {
        enqueueToMerge.push(minutesBetween(at, merged.mergedAt));
        enqueued.delete(merged.number);
      }
    }
  }
  const pulls: SimPull[] = [...seen]
    .filter(([, each]) => each.readyAt.startsWith(date))
    .map(([number, each]) => ({
      number,
      readyAt: each.readyAt,
      fastTrack: each.fastTrack,
      failsOnce: each.failedAt !== null,
      conflictsAt: each.conflictsAt,
      files: each.files,
    }));
  const refix = [...seen.values()].flatMap((each) =>
    each.failedAt !== null && each.readyAgainAt !== null
      ? [minutesBetween(each.failedAt, each.readyAgainAt)]
      : [],
  );
  return {
    date,
    pulls,
    timings: measuredTimings({ enqueueToMerge, refix, building }),
    recorded: null,
  };
}
