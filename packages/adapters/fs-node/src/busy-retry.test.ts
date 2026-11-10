import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type BusySystem, busyDelayMs, busyLimitMs, retryWhileBusy } from "./busy-retry.ts";

function systemError(code: string): Error {
  return Object.assign(new Error(`${code}: operation not permitted, open`), { code });
}

/**
 * A system on `platform` whose clock moves on only when it waits. It records
 * every wait, and never really waits.
 */
function fakeSystem(platform: string): BusySystem & { waits: number[] } {
  let clock = 0;
  const system = {
    platform,
    waits: [] as number[],
    now: () => clock,
    async wait(ms: number) {
      system.waits.push(ms);
      clock += ms;
    },
  };
  return system;
}

/** A step that fails with each of `failures` in turn and then gives "done", counting its runs. */
function failingStep(failures: string[]): (() => Promise<string>) & { runs: number } {
  const remaining = [...failures];
  const step = Object.assign(
    async () => {
      step.runs += 1;
      const code = remaining.shift();
      if (code !== undefined) {
        throw systemError(code);
      }
      return "done";
    },
    { runs: 0 },
  );
  return step;
}

verifies("fs-node.run-store-lock", () => {
  describe("retryWhileBusy", () => {
    it("tries again on Windows while a file is delete-pending or held open", async () => {
      const system = fakeSystem("win32");
      const step = failingStep(["EPERM", "EBUSY"]);
      expect(await retryWhileBusy(step, system)).toBe("done");
      expect(step.runs).toBe(3);
      expect(system.waits).toEqual([busyDelayMs, busyDelayMs]);
    });

    it("throws the last busy error once the step stays busy past the limit", async () => {
      const system = fakeSystem("win32");
      const step = failingStep(Array(1_000).fill("EPERM"));
      await expect(retryWhileBusy(step, system)).rejects.toMatchObject({ code: "EPERM" });
      expect(step.runs).toBe(Math.ceil(busyLimitMs / busyDelayMs) + 1);
    });

    it("throws an error that isn't busy at once", async () => {
      const system = fakeSystem("win32");
      const step = failingStep(["ENOENT"]);
      await expect(retryWhileBusy(step, system)).rejects.toMatchObject({ code: "ENOENT" });
      expect(step.runs).toBe(1);
    });

    it("never retries off Windows, where EPERM is a real refusal", async () => {
      const system = fakeSystem("linux");
      const step = failingStep(["EPERM"]);
      await expect(retryWhileBusy(step, system)).rejects.toMatchObject({ code: "EPERM" });
      expect(system.waits).toEqual([]);
    });
  });
});
