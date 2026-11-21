import { ServiceRegistry } from "@halonicjs/app";
import { RunStartHostService } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { provideRunStart } from "./provide-run-start.ts";

const askTrust = async () => "trusted" as const;

verifies("studio.engine-cancel", () => {
  it("cancels a run on the engine that runs the folder", async () => {
    const services = new ServiceRegistry();
    const cancel = vi.fn(async (runId: string) => ({ id: runId }) as never);
    const startRun = vi.fn(async () => ({ runId: "run_mfx3k2a1_01jd8q" }));
    provideRunStart(services, { workflows: { startRun }, engine: { cancel }, askTrust });

    await services.get(RunStartHostService).cancelRun?.("run_mfx3k2a1_01jd8q");

    expect(cancel).toHaveBeenCalledWith("run_mfx3k2a1_01jd8q");
  });

  it("passes on the engine's reason when it can't cancel", async () => {
    const services = new ServiceRegistry();
    const cancel = vi.fn(async () => Promise.reject(new Error('There\'s no run "run1".')));
    const startRun = vi.fn(async () => ({ runId: "run1" }));
    provideRunStart(services, { workflows: { startRun }, engine: { cancel }, askTrust });

    await expect(services.get(RunStartHostService).cancelRun?.("run1")).rejects.toThrow(
      "There's no run",
    );
  });

  it("offers neither a start nor a cancel where the workflows can't start a run", () => {
    const services = new ServiceRegistry();
    provideRunStart(services, { workflows: {}, engine: { cancel: vi.fn() }, askTrust });

    expect(services.has(RunStartHostService)).toBe(false);
  });
});

verifies("runs.run-view.run-again-review", () => {
  it("tells the run page when the workspace may run, wherever it was trusted", () => {
    const services = new ServiceRegistry();
    const listeners = new Set<() => void>();
    let mayStart = false;
    const trust = {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      mayStartNow: () => mayStart,
    };
    const startRun = vi.fn(async () => ({ runId: "run1" }));
    provideRunStart(services, {
      workflows: { startRun },
      engine: { cancel: vi.fn() },
      askTrust,
      trust,
    });
    const listener = vi.fn();
    const stop = services.get(RunStartHostService).onTrusted?.(listener);

    for (const notify of listeners) notify();
    mayStart = true;
    for (const notify of listeners) notify();
    stop?.();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});
