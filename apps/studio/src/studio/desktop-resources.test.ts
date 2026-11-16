import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { watchDesktopResources } from "./desktop-resources.ts";

const report = {
  engineMemoryBytes: 230 * 1024 ** 2,
  childProcesses: [],
  dataBytes: 5 * 1024 ** 2,
  freeDiskBytes: 48 * 1024 ** 3,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("studio.entry", () => {
  it("reads the shell's resource report at once and then every minute", async () => {
    const commands: string[] = [];
    const invoke = async (command: string) => {
      commands.push(command);
      return report;
    };

    const watch = watchDesktopResources({ invoke } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(commands).toEqual(["resource_report"]);
    expect(watch.latest?.report.freeDiskBytes).toBe(report.freeDiskBytes);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(commands).toEqual(["resource_report", "resource_report"]);
    watch.stop();
  });

  it("keeps reading after a failed read, and says why in the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let failing = true;
    const invoke = async () => {
      if (failing) throw new Error("no answer");
      return report;
    };

    const watch = watchDesktopResources({ invoke } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(watch.latest).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();

    failing = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(watch.latest?.lowDisk).toBe(false);
    watch.stop();
    warn.mockRestore();
  });

  it("stops reading when stopped", async () => {
    const invoke = vi.fn(async () => report);

    const watch = watchDesktopResources({ invoke } as never);
    await vi.advanceTimersByTimeAsync(0);
    watch.stop();
    await vi.advanceTimersByTimeAsync(180_000);

    expect(invoke).toHaveBeenCalledOnce();
  });
});
