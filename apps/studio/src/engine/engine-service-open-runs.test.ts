import { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("studio.restart-runs", () => {
  it("lists nothing, and takes no lock, while the engine isn't open", async () => {
    const shell = fakeShell();
    const service = serviceOn(shell);

    await expect(service.openRuns()).resolves.toBeUndefined();

    expect(lockCalls(shell)).toEqual([]);
  });

  it("lists the open engine's running and waiting runs, with the workspace it loaded", async () => {
    const service = serviceOn(fakeShell());
    await service.open();
    const going = [{ id: "run1", status: "running" }] as unknown as RunSummary[];
    const list = vi.spyOn(TauriRunStore.prototype, "list").mockResolvedValue(going);

    const open = await service.openRuns();

    expect(list).toHaveBeenCalledWith({ status: ["running", "waiting"] });
    expect(open?.runs).toBe(going);
    expect(open?.workspace.files.length).toBeGreaterThan(0);
    await service.close();
    await expect(service.openRuns()).resolves.toBeUndefined();
  });
});
