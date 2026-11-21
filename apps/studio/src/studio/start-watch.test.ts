import type { StartReport } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { type StartTimers, startPollMs, watchStart } from "./start-watch.ts";

/** Timers the test fires by hand: `fire` runs the one waiting, if any. */
function handTimers() {
  let waiting: (() => void) | undefined;
  const timers: StartTimers = {
    setTimeout: (callback, ms) => {
      expect(ms).toBe(startPollMs);
      waiting = callback;
      return callback;
    },
    clearTimeout: (handle) => {
      if (handle === waiting) waiting = undefined;
    },
  };
  return {
    timers,
    get waiting() {
      return waiting !== undefined;
    },
    fire: async () => {
      const callback = waiting;
      waiting = undefined;
      callback?.();
      await settled();
    },
  };
}

/** Lets the watch's awaited calls finish. */
async function settled() {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

function report(state: StartReport["state"], seconds: number, more: Partial<StartReport> = {}) {
  return { state, phase: "engine_ready", cause: null, exitCode: null, seconds, ...more };
}

/** A window that answers `start_status` from `answers`, one per ask, the last one again after. */
function windowOf(answers: unknown[]) {
  const calls: string[] = [];
  const ipc = {
    invoke: vi.fn(async (command: string) => {
      calls.push(command);
      if (command === "start_status") return answers.length > 1 ? answers.shift() : answers[0];
      if (command === "lite_check") return [{ id: "app_files", fact: "present" }];
      return undefined;
    }),
  };
  return { ipc, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("studio.start-watch", () => {
  it("tells the window the page is ready, then asks once a second until the start is ready", async () => {
    const { ipc, calls } = windowOf([
      report("starting", 0),
      report("starting", 1),
      report("ready", 2),
    ]);
    const clock = handTimers();
    const start = watchStart(ipc, "macos", "0.1.0", clock.timers);
    const seen: (string | undefined)[] = [];
    start.subscribe(() => seen.push(start.report?.state));
    await settled();

    expect(calls).toEqual(["engine_ready", "start_status"]);
    await clock.fire();
    await clock.fire();
    expect(seen).toEqual(["starting", "starting", "ready"]);
    expect(clock.waiting).toBe(false);
    expect(start.about).toBe("Halonic 0.1.0 · macOS");
  });

  it("keeps asking after a failure, because a late host still turns it ready", async () => {
    const failed = report("failed", 60, { cause: "timed_out" });
    const { ipc } = windowOf([failed, report("ready", 61)]);
    const clock = handTimers();
    const start = watchStart(ipc, "windows", "0.1.0", clock.timers);
    await settled();

    expect(start.report?.state).toBe("failed");
    expect(clock.waiting).toBe(true);
    await clock.fire();
    expect(start.report?.state).toBe("ready");
  });

  it("tries again with a new engine_ready", async () => {
    const { ipc, calls } = windowOf([report("failed", 60, { cause: "timed_out" })]);
    const clock = handTimers();
    const start = watchStart(ipc, "linux", "0.1.0", clock.timers);
    await settled();

    await start.tryAgain();
    expect(calls).toEqual(["engine_ready", "start_status", "engine_ready", "start_status"]);
  });

  it("reads as ready when the window can't say twice in a row, so Welcome is never held up", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ipc = { invoke: vi.fn(async () => Promise.reject(new Error("not granted"))) };
    const clock = handTimers();
    const start = watchStart(ipc, "macos", "0.1.0", clock.timers);
    await settled();
    expect(start.report).toBeUndefined();
    expect(clock.waiting).toBe(true);

    await clock.fire();
    expect(start.report?.state).toBe("ready");
    expect(clock.waiting).toBe(false);
  });

  it("asks on after one failed call, so a passing hiccup doesn't end the watch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const answers: (() => unknown)[] = [
      () => report("starting", 0),
      () => {
        throw new Error("busy");
      },
      () => report("starting", 2),
      () => {
        throw new Error("busy");
      },
      () => report("ready", 4),
    ];
    const ipc = {
      invoke: vi.fn(async (command: string) =>
        command === "start_status" ? answers.shift()?.() : undefined,
      ),
    };
    const clock = handTimers();
    const start = watchStart(ipc, "macos", "0.1.0", clock.timers);
    const seen: (string | undefined)[] = [];
    start.subscribe(() => seen.push(start.report?.state));
    await settled();

    for (let ask = 0; ask < 4; ask += 1) await clock.fire();
    expect(seen).toEqual(["starting", "starting", "ready"]);
    expect(clock.waiting).toBe(false);
  });

  it("reads as ready at once when the window answers something else", async () => {
    const { ipc } = windowOf([{ unexpected: true }]);
    const clock = handTimers();
    const start = watchStart(ipc, "macos", "0.1.0", clock.timers);
    await settled();

    expect(start.report?.state).toBe("ready");
    expect(clock.waiting).toBe(false);
  });

  it("runs the window's lite check for Check this computer", async () => {
    const { ipc } = windowOf([report("ready", 1)]);
    const start = watchStart(ipc, "macos", "0.1.0", handTimers().timers);

    expect(await start.check()).toEqual([{ id: "app_files", fact: "present" }]);
  });

  it("stops asking when the window closes", async () => {
    const { ipc } = windowOf([report("starting", 0)]);
    const clock = handTimers();
    const start = watchStart(ipc, "macos", "0.1.0", clock.timers);
    await settled();

    start.stop();
    expect(clock.waiting).toBe(false);
  });
});
