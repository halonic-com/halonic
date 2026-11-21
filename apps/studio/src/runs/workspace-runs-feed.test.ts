import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { publishCall, realEngine, replyStart, textAnswer } from "../inbox/real-runs.test-helper.ts";
import { type PollTimer, type RunFeedListener, WorkspaceRuns } from "./workspace-runs.ts";

const acmeFiles = () => new MemoryDefinitionStore({ "workspace.yaml": "id: acme\nname: Acme\n" });

/** A timer the test ticks by hand; `running` counts what waits on it. */
function manualTimer() {
  const ticks = new Set<() => void>();
  const timer: PollTimer = {
    every: (_ms, tick) => {
      ticks.add(tick);
      return () => ticks.delete(tick);
    },
  };
  return {
    timer,
    running: () => ticks.size,
    tick: () => {
      for (const tick of [...ticks]) tick();
    },
  };
}

/** The engine's feed of run changes, as the test plays it: `listener` is the one connected now. */
function fakeFeed() {
  const feed = {
    listener: undefined as RunFeedListener | undefined,
    connects: 0,
    stops: 0,
    followRuns: (listener: RunFeedListener) => {
      feed.listener = listener;
      feed.connects += 1;
      return () => {
        feed.stops += 1;
      };
    },
  };
  return feed;
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function acmeRuns() {
  const engine = realEngine([publishCall, textAnswer("Done.")]);
  await engine.settle((await engine.executor.start(replyStart)).id);
  return engine;
}

verifies("studio.workspace-runs", () => {
  it("with the engine's feed, reads the runs when it says one changed, and not every 10 s", async () => {
    const engine = await acmeRuns();
    const clock = manualTimer();
    const feed = fakeFeed();
    const runs = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: acmeFiles(),
      timer: clock.timer,
      followRuns: feed.followRuns,
    });
    const heard = vi.fn();
    const stop = runs.subscribe(heard);
    await settled();
    expect(clock.running()).toBe(0);

    await engine.executor.start(replyStart);
    feed.listener?.changed();
    await settled();
    expect(heard).toHaveBeenCalledTimes(1);

    stop();
    expect(feed.stops).toBe(1);
  });

  it("connects again 10 s after the feed broke off, reads the runs then, and reports why", async () => {
    const engine = await acmeRuns();
    const clock = manualTimer();
    const feed = fakeFeed();
    const reportError = vi.fn();
    const runs = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: acmeFiles(),
      timer: clock.timer,
      followRuns: feed.followRuns,
      reportError,
    });
    const heard = vi.fn();
    const stop = runs.subscribe(heard);
    await settled();

    const why = new Error("The engine isn't answering.");
    feed.listener?.ended(why);
    expect(reportError).toHaveBeenCalledWith(why);
    // A run the feed couldn't tell of while it was down.
    await engine.executor.start(replyStart);
    clock.tick();
    await settled();

    expect(feed.connects).toBe(2);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(clock.running()).toBe(0);
    stop();
  });

  it("doesn't connect again after the last listener went", async () => {
    const engine = await acmeRuns();
    const clock = manualTimer();
    const feed = fakeFeed();
    const runs = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: acmeFiles(),
      timer: clock.timer,
      followRuns: feed.followRuns,
    });

    runs.subscribe(vi.fn())();
    feed.listener?.ended();

    expect(clock.running()).toBe(0);
    expect(feed.connects).toBe(1);
  });

  it("reads once more when a run changed during a read, so the change isn't lost", async () => {
    const engine = await acmeRuns();
    const store = engine.stores.store;
    let hold: Promise<void> | undefined;
    // A list that takes what the runs are when it is called, then waits for `hold`.
    const slow: Pick<RunStore, "list" | "events"> = {
      list: async (filter) => {
        const now = await store.list(filter);
        await hold;
        return now;
      },
      events: (runId) => store.events(runId),
    };
    const feed = fakeFeed();
    const runs = new WorkspaceRuns({
      runs: slow,
      definitions: acmeFiles(),
      timer: manualTimer().timer,
      followRuns: feed.followRuns,
    });
    const heard = vi.fn();
    const stop = runs.subscribe(heard);
    await settled();

    let release = () => {};
    hold = new Promise((resolve) => {
      release = resolve;
    });
    feed.listener?.changed();
    await settled();
    await engine.executor.start(replyStart);
    feed.listener?.changed();
    hold = undefined;
    release();
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    stop();
  });
});
