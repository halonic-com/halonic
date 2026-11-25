import type { AgentNotice, NoticeTarget, Notifier } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultRunNotificationSettings,
  type NotifiableRun,
  type RunNotificationSettings,
} from "./run-notices.ts";
import { failureGroupMs, type RunsReader, watchRunNotifications } from "./run-notifications.ts";

const start = new Date("2026-11-25T14:00:00.000Z");

const nightly: NotifiableRun = {
  id: "run-nightly",
  phase: "running",
  kind: "workflow",
  name: "Nightly report",
  where: "Acme Ops",
  startedAt: "2026-11-25T13:58:00.000Z",
  startedByMe: false,
  failedStep: "Fetch sales",
  cost: { kind: "none" },
};

const agentRun: NotifiableRun = {
  id: "run-agent",
  phase: "running",
  kind: "agent",
  name: "Ada",
  where: "Paperclip · Acme",
  startedAt: "2026-11-25T13:59:00.000Z",
  startedByMe: false,
  task: "HAL-18533",
  cost: { kind: "tokens", tokens: 1200 },
};

const digest: NotifiableRun = {
  id: "run-digest",
  phase: "running",
  kind: "workflow",
  name: "Weekly digest",
  where: "Acme Ops",
  startedAt: "2026-11-25T13:56:00.000Z",
  tookMs: 240_000,
  startedByMe: true,
  cost: { kind: "money", currency: "EUR", minorUnits: 2 },
};

/** Runs whose reading the test sets, and a change it reports by hand. */
function fakeRuns(initial: readonly NotifiableRun[]) {
  let current = initial;
  const waiting: ((result: IteratorResult<unknown>) => void)[] = [];
  const reader: RunsReader = {
    read: () => Promise.resolve(current),
    changes: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<unknown>>((resolve) => waiting.push(resolve)),
      }),
    }),
  };
  return {
    reader,
    /** Sets what the next read gives, reports a change and lets the watch handle it. */
    async change(runs: readonly NotifiableRun[]) {
      current = runs;
      waiting.shift()?.({ done: false, value: "changed" });
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

function recorder() {
  const shown: AgentNotice[] = [];
  const clicks: (() => void)[] = [];
  const notifier: Notifier = {
    show(notice, onClick) {
      shown.push(notice);
      clicks.push(onClick);
      return Promise.resolve();
    },
  };
  return { shown, clicks, notifier };
}

async function watching(
  initial: readonly NotifiableRun[],
  settings: RunNotificationSettings = defaultRunNotificationSettings,
) {
  const runs = fakeRuns(initial);
  const { shown, clicks, notifier } = recorder();
  const opened: NoticeTarget[] = [];
  const watch = watchRunNotifications(runs.reader, notifier, {
    settings: () => settings,
    now: () => new Date(),
    open: (target) => opened.push(target),
    onError: (error) => {
      throw error;
    },
  });
  await watch.ready;
  return { runs, shown, clicks, opened, watch };
}

function ended(run: NotifiableRun, phase: NotifiableRun["phase"]): NotifiableRun {
  return { ...run, phase };
}

verifies("runs.run-notifications", () => {
  describe("watchRunNotifications", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: start });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("notifies a failed workflow run in the design's words and opens Runs on it", async () => {
      const { runs, shown, clicks, opened, watch } = await watching([nightly]);
      await runs.change([ended(nightly, "failed")]);
      expect(shown).toEqual([
        {
          reason: "run",
          title: "Nightly report failed",
          body: "Acme Ops · in the step Fetch sales",
          target: { kind: "run", id: "run-nightly" },
        },
      ]);
      clicks[0]?.();
      expect(opened).toEqual([{ kind: "run", id: "run-nightly" }]);
      await watch.stop();
    });

    it("says an agent's run stopped with an error, with its task", async () => {
      const { runs, shown, watch } = await watching([agentRun]);
      await runs.change([ended(agentRun, "failed")]);
      expect(shown.map((notice) => [notice.title, notice.body])).toEqual([
        ["Ada's run stopped with an error", "Paperclip · Acme · HAL-18533"],
      ]);
      await watch.stop();
    });

    it("notifies a finished run the user started, but not one the schedule started", async () => {
      const bySchedule = { ...digest, id: "run-other", startedByMe: false };
      const { runs, shown, watch } = await watching([digest, bySchedule]);
      await runs.change([ended(digest, "succeeded"), ended(bySchedule, "succeeded")]);
      expect(shown.map((notice) => [notice.title, notice.body])).toEqual([
        ["Weekly digest finished", "Acme Ops · took 4 min · €0.02"],
      ]);
      await watch.stop();
    });

    it("follows the switches: any finished run when on, no failures when off", async () => {
      const settings = { failed: false, startedByMeFinished: false, anyFinished: true };
      const bySchedule = { ...digest, startedByMe: false };
      const { runs, shown, watch } = await watching([bySchedule, nightly], settings);
      await runs.change([ended(bySchedule, "succeeded"), ended(nightly, "failed")]);
      expect(shown.map((notice) => notice.title)).toEqual(["Weekly digest finished"]);
      await watch.stop();
    });

    it("shows nothing for what was there at the start, a stopped run, or an old run seen late", async () => {
      const old = { ...ended(nightly, "failed"), id: "run-old" };
      const lateButOld = { ...ended(agentRun, "failed"), id: "run-late" };
      const { runs, shown, watch } = await watching([old, digest]);
      await runs.change([old, ended(digest, "stopped"), lateButOld]);
      expect(shown).toEqual([]);
      await watch.stop();
    });

    it("notifies a run that started and failed between two readings", async () => {
      const { runs, shown, watch } = await watching([]);
      const quick = { ...ended(nightly, "failed"), startedAt: "2026-11-25T14:00:00.500Z" };
      await vi.advanceTimersByTimeAsync(1000);
      await runs.change([quick]);
      expect(shown.map((notice) => notice.title)).toEqual(["Nightly report failed"]);
      await watch.stop();
    });

    it("groups failures in the minute after a shown one and opens the Failed group", async () => {
      const second = { ...agentRun, id: "run-second" };
      const { runs, shown, clicks, opened, watch } = await watching([nightly, agentRun, second]);
      await runs.change([ended(nightly, "failed"), agentRun, second]);
      await vi.advanceTimersByTimeAsync(20_000);
      await runs.change([
        ended(nightly, "failed"),
        ended(agentRun, "failed"),
        ended(second, "failed"),
      ]);
      expect(shown.map((notice) => notice.title)).toEqual(["Nightly report failed"]);
      await vi.advanceTimersByTimeAsync(failureGroupMs);
      expect(shown.at(-1)).toEqual({
        reason: "run",
        title: "2 runs failed",
        body: "Paperclip · Acme",
        target: { kind: "runs-failed", id: "failed" },
      });
      clicks.at(-1)?.();
      expect(opened).toEqual([{ kind: "runs-failed", id: "failed" }]);
      await watch.stop();
    });

    it("shows a single held failure as its own, with every place for several at once", async () => {
      const second = { ...agentRun, id: "run-second" };
      const { runs, shown, watch } = await watching([nightly, agentRun, second]);
      await runs.change([ended(nightly, "failed"), ended(agentRun, "failed"), second]);
      await runs.change([
        ended(nightly, "failed"),
        ended(agentRun, "failed"),
        ended(second, "failed"),
      ]);
      await vi.advanceTimersByTimeAsync(failureGroupMs);
      expect(shown.map((notice) => [notice.title, notice.body])).toEqual([
        ["2 runs failed", "Acme Ops, Paperclip · Acme"],
        ["Ada's run stopped with an error", "Paperclip · Acme · HAL-18533"],
      ]);
      await watch.stop();
    });
  });
});
