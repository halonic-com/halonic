import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunUpdateFrame } from "@halonicjs/host-server";
import type { RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runUpdatesEveryMs, runUpdatesFeed } from "./run-updates-feed.ts";

/** A run store of `acme` runs whose statuses and event counts the test sets. */
class TestRuns implements Pick<RunStore, "list" | "events"> {
  readonly runs = new Map<string, { status: RunSummary["status"]; seq: number }>();
  lists = 0;

  async list(): Promise<RunSummary[]> {
    this.lists += 1;
    return [...this.runs].map(([id, { status }]) => ({ id, status }) as RunSummary);
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const last = this.runs.get(runId)?.seq ?? 0;
    const events: RunEvent[] = [];
    for (let seq = afterSeq + 1; seq <= last; seq += 1) events.push({ seq } as RunEvent);
    return events;
  }
}

/** A timer the test ticks by hand, in place of a real one. */
class HandTimer {
  ticks: Array<() => void> = [];
  every = (tick: () => void, ms: number) => {
    expect(ms).toBe(runUpdatesEveryMs);
    this.ticks.push(tick);
    return () => {
      this.ticks = this.ticks.filter((each) => each !== tick);
    };
  };

  /** Runs every tick and lets the reads it started finish. */
  async tick(): Promise<void> {
    for (const tick of this.ticks) tick();
    await settled();
  }
}

async function settled(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

function feedOn(runs: TestRuns, timer: HandTimer) {
  return runUpdatesFeed({ runs, every: timer.every, reportError: () => undefined });
}

verifies("agent-host.engine-run-updates-feed", () => {
  describe("runUpdatesFeed", () => {
    it("sends one frame per status change, with the run's latest seq", async () => {
      const runs = new TestRuns();
      runs.runs.set("run_acme_1", { status: "running", seq: 2 });
      const timer = new HandTimer();
      const frames: RunUpdateFrame[] = [];
      feedOn(runs, timer).follow((frame) => frames.push(frame));
      await settled();
      expect(frames).toEqual([]);

      runs.runs.set("run_acme_1", { status: "waiting", seq: 5 });
      runs.runs.set("run_acme_2", { status: "running", seq: 1 });
      await timer.tick();
      expect(frames).toEqual([
        { runId: "run_acme_1", status: "waiting", seq: 5 },
        { runId: "run_acme_2", status: "running", seq: 1 },
      ]);

      // A new event without a status change sends nothing.
      runs.runs.set("run_acme_1", { status: "waiting", seq: 6 });
      await timer.tick();
      expect(frames).toHaveLength(2);
    });

    it("reads only while someone follows, and keeps no history", async () => {
      const runs = new TestRuns();
      const timer = new HandTimer();
      const feed = feedOn(runs, timer);
      expect(timer.ticks).toHaveLength(0);

      const frames: RunUpdateFrame[] = [];
      const unfollow = feed.follow((frame) => frames.push(frame));
      await settled();
      unfollow();
      expect(timer.ticks).toHaveLength(0);

      runs.runs.set("run_acme_1", { status: "completed", seq: 4 });
      feed.follow((frame) => frames.push(frame));
      await settled();
      await timer.tick();
      expect(frames).toEqual([]);
    });

    it("reports a failed read and tries again on the next tick", async () => {
      const runs = new TestRuns();
      const errors: unknown[] = [];
      const timer = new HandTimer();
      const failing = new Error("acme runs folder is unreadable");
      runs.list = async () => {
        throw failing;
      };
      runUpdatesFeed({
        runs,
        every: timer.every,
        reportError: (error) => errors.push(error),
      }).follow(() => undefined);
      await settled();
      expect(errors).toEqual([failing]);
      await timer.tick();
      expect(errors).toEqual([failing, failing]);
    });
  });
});
