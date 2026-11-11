import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exitGraceMs, exitWithin } from "./exit-within.ts";

/** A process that exits when the test says so, and counts its kills. */
function fakeProcess() {
  const exit = Promise.withResolvers<SandboxExit>();
  let kills = 0;
  const process = {
    exited: exit.promise,
    kill: async () => {
      kills += 1;
    },
  } as unknown as SandboxProcess;
  return { process, exit: exit.resolve, kills: () => kills };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("harness-kit.exit-within", () => {
  it("gives the exit of a program that exits in time, and kills nothing", async () => {
    const { process, exit, kills } = fakeProcess();
    const waited = exitWithin(process, "Acme CLI");
    exit({ code: 0, signal: null, reason: "exited" });

    await expect(waited).resolves.toEqual({ code: 0, signal: null, reason: "exited" });
    expect(kills()).toBe(0);
  });

  it("kills a program that doesn't exit in time, and fails with a plain error", async () => {
    const { process, kills } = fakeProcess();
    const waited = exitWithin(process, "Acme CLI", 2_000);
    const failed = expect(waited).rejects.toThrow(
      "Acme CLI didn't exit within 2 seconds, so Halonic stopped it.",
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await failed;
    expect(kills()).toBe(1);
  });

  it("waits 10 seconds when it is given no time", async () => {
    expect(exitGraceMs).toBe(10_000);
    const { process, kills } = fakeProcess();
    const waited = exitWithin(process, "Acme CLI").catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(kills()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(await waited).toBeInstanceOf(Error);
    expect(kills()).toBe(1);
  });
});
