import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { LateEngine, type OwnEngine } from "./late-engine.ts";

/** The page's own engine, recording what it was asked. */
function ownEngine() {
  const skipListeners = new Set<() => void>();
  const own = {
    startRun: vi.fn(async () => ({ id: "own-run" })),
    startRoutine: vi.fn(async () => ({ id: "own-routine-run" })),
    routineSkips: vi.fn(async () => []),
    onRoutineSkips: (listener: () => void) => {
      skipListeners.add(listener);
      return () => skipListeners.delete(listener);
    },
    send: vi.fn(),
    cancel: vi.fn(),
    openForStart: vi.fn(),
    pageRuns: { runsHarnesses: false, startsConnectors: false },
  };
  return { own: own as unknown as OwnEngine & typeof own, skipListeners };
}

verifies("studio.open-folder-before-engine", () => {
  it("starts a run on the page's own engine only once the shell said no background engine runs", async () => {
    const { own } = ownEngine();
    let answer = (_engine: undefined): void => {};
    const engine = new LateEngine(new Promise((resolve) => (answer = resolve)), () => own);

    const started = engine.startRun({ hubId: "acme", workflowId: "reply" }, {}, "inbox");
    await Promise.resolve();
    expect(own.startRun).not.toHaveBeenCalled();
    expect(engine.pageRuns).toEqual({ runsHarnesses: true, startsConnectors: true });

    answer(undefined);
    await expect(started).resolves.toEqual({ id: "own-run" });
    expect(own.startRun).toHaveBeenCalledWith({ hubId: "acme", workflowId: "reply" }, {}, "inbox");
    expect(engine.pageRuns).toEqual(own.pageRuns);
  });

  it("ends the feed of run changes at once on the page's own engine, so the runs are read every 10 s", async () => {
    const { own } = ownEngine();
    const engine = new LateEngine(Promise.resolve(undefined), () => own);
    const ended = vi.fn();

    engine.followRuns({ changed: vi.fn(), ended });
    await engine.chosen();

    expect(ended).toHaveBeenCalledWith();
  });

  it("hears the chosen engine's skip records from a listener added before the choice, until it stops", async () => {
    const { own, skipListeners } = ownEngine();
    const engine = new LateEngine(Promise.resolve(undefined), () => own);
    const heard = vi.fn();

    const stop = engine.onRoutineSkips(heard);
    await engine.chosen();
    for (const listener of skipListeners) listener();
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(skipListeners.size).toBe(0);
  });
});
