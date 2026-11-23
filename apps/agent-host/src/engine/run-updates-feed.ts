// The engine role's feed of run changes for `GET /api/run-updates`. The
// engine has no feed of every run's events, only one per run, so the feed
// reads the run store's summaries while someone follows it and sends one
// frame for each run whose status changed since the last read.
import type { RunStatus } from "@halonicjs/events";
import type { RunUpdateFrame, RunUpdates } from "@halonicjs/host-server";
import type { RunStore } from "@halonicjs/ports";

/**
 * How often the feed reads the runs while anyone follows it: soon enough
 * that a window shows a run's change at once, and one read of the summaries
 * a second costs little on this computer.
 */
export const runUpdatesEveryMs = 1_000;

/** What {@link runUpdatesFeed} reads and runs on. */
export interface RunUpdatesFeedInput {
  /** The engine's run store. */
  readonly runs: Pick<RunStore, "list" | "events">;
  /** Runs `tick` every `ms` milliseconds, until the returned function is called. */
  every(tick: () => void, ms: number): () => void;
  /** Hears a read of the runs that failed; the next read tries again. */
  reportError(error: unknown): void;
}

type Listener = (update: RunUpdateFrame) => void;

/**
 * The feed: one frame for each change of a run's status, `seq` being that
 * run's latest event's. It reads only while someone follows, and the first
 * read after nobody did sends nothing, so it keeps no history.
 */
export function runUpdatesFeed(input: RunUpdatesFeedInput): RunUpdates {
  const listeners = new Set<Listener>();
  // `undefined` until the first read: what the runs were when following began.
  let known: Map<string, RunStatus> | undefined;
  const seqs = new Map<string, number>();
  let cancel: (() => void) | undefined;
  let reading = false;
  // Changes when following stops, so a read that ends after it sends nothing.
  let round = 0;

  const latestSeq = async (runId: string): Promise<number> => {
    const after = seqs.get(runId) ?? 0;
    const seq = (await input.runs.events(runId, after)).at(-1)?.seq ?? after;
    seqs.set(runId, seq);
    return seq;
  };

  const read = async (): Promise<void> => {
    const at = round;
    const summaries = await input.runs.list();
    if (at !== round) return;
    const before = known;
    known = new Map(summaries.map((run) => [run.id, run.status]));
    if (before === undefined) return;
    for (const run of summaries.filter((each) => before.get(each.id) !== each.status)) {
      const frame = { runId: run.id, status: run.status, seq: await latestSeq(run.id) };
      if (at !== round) return;
      for (const listener of listeners) listener(frame);
    }
  };

  const tick = () => {
    if (reading) return;
    reading = true;
    read()
      .catch((error: unknown) => input.reportError(error))
      .finally(() => {
        reading = false;
      });
  };

  return {
    follow(listener) {
      listeners.add(listener);
      if (cancel === undefined) {
        cancel = input.every(tick, runUpdatesEveryMs);
        tick();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || cancel === undefined) return;
        cancel();
        cancel = undefined;
        round += 1;
        known = undefined;
        seqs.clear();
      };
    },
  };
}
