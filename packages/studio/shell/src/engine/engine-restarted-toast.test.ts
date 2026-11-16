import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { createShell } from "../shell.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { stoppedRunsText, watchEngineRestart } from "./engine-restarted-toast.ts";
import type { EngineLauncher, EngineProcessEvents } from "./engine-start.ts";

class FakeLauncher implements EngineLauncher {
  readonly processes: EngineProcessEvents[] = [];
  start(events: EngineProcessEvents) {
    this.processes.push(events);
    return { stop: () => {} };
  }
  get latest(): EngineProcessEvents {
    const events = this.processes.at(-1);
    if (events === undefined) {
      throw new Error("no process started");
    }
    return events;
  }
}

function setUp() {
  const timers = new FakeTimers();
  const shell = createShell({ features: [], timers });
  const toasts = createToastStore();
  const openRuns = vi.fn();
  watchEngineRestart({ engine: shell.engine, toasts, openRuns });
  const launcher = new FakeLauncher();
  shell.engine.supervise(launcher);
  return { timers, shell, toasts, openRuns, launcher };
}

/** Stops the engine and lets the shell restart it. */
function restart(s: ReturnType<typeof setUp>, interruptedRuns?: number) {
  s.launcher.latest.exited(1);
  s.timers.advance(10_000);
  s.launcher.latest.ready(interruptedRuns);
}

verifies("shell.engine-restarted-toast", () => {
  it("counts the runs the restart stopped, with Open Runs", () => {
    const s = setUp();
    s.launcher.latest.ready();
    restart(s, 2);
    const [toast] = s.toasts.list();
    expect(toast).toMatchObject({
      tone: "info",
      title: "The engine stopped and has started again.",
      text: "2 runs stopped; you can run them again.",
    });
    toast?.action?.onClick();
    expect(s.openRuns).toHaveBeenCalledOnce();
  });

  it("is only the phrase when no run stopped", () => {
    const s = setUp();
    s.launcher.latest.ready();
    restart(s);
    const [toast] = s.toasts.list();
    expect(toast?.title).toBe("The engine stopped and has started again.");
    expect(toast?.text).toBeUndefined();
    expect(toast?.action).toBeUndefined();
  });

  it("shows nothing for the first start", () => {
    const s = setUp();
    s.launcher.latest.ready(3);
    expect(s.toasts.list()).toEqual([]);
  });

  it("says one run in the singular", () => {
    expect(stoppedRunsText(1)).toBe("1 run stopped; you can run it again.");
  });
});
