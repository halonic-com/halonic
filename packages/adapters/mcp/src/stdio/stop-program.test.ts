import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExit, RunningProgram } from "./program.ts";
import { stopProgram } from "./stop-program.ts";

type StopStep = "endInput" | "terminate" | "kill";

/**
 * A program that records each stop step it is given and ends only at
 * `endsAt`, or never when `endsAt` is `undefined`.
 */
function programEndingAt(endsAt: StopStep | undefined): {
  program: RunningProgram;
  steps: StopStep[];
} {
  const steps: StopStep[] = [];
  let end: (exit: ProgramExit) => void = () => {};
  const exited = new Promise<ProgramExit>((resolve) => {
    end = resolve;
  });
  const take = (step: StopStep, exit: ProgramExit) => {
    steps.push(step);
    if (step === endsAt) end(exit);
  };
  const program: RunningProgram = {
    write: async () => {},
    endInput: () => take("endInput", { code: 0, signal: null }),
    stdout: (async function* () {})(),
    stderr: (async function* () {})(),
    exited,
    signal: (kind) => take(kind, { code: null, signal: kind === "kill" ? "SIGKILL" : "SIGTERM" }),
  };
  return { program, steps };
}

const graceMs = 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("mcp.stdio-transport", () => {
  describe("stopping a program", () => {
    it("only closes its input when it ends within the grace time", async () => {
      const { program, steps } = programEndingAt("endInput");
      expect(await stopProgram(program, graceMs)).toEqual({ code: 0, signal: null });
      expect(steps).toEqual(["endInput"]);
    });

    it("asks it to end once the grace time after closing its input has passed", async () => {
      const { program, steps } = programEndingAt("terminate");
      const stopped = stopProgram(program, graceMs);
      await vi.advanceTimersByTimeAsync(graceMs - 1);
      expect(steps).toEqual(["endInput"]);
      await vi.advanceTimersByTimeAsync(1);
      expect(await stopped).toEqual({ code: null, signal: "SIGTERM" });
      expect(steps).toEqual(["endInput", "terminate"]);
    });

    it("forces it after a second grace time when asking didn't end it", async () => {
      const { program, steps } = programEndingAt("kill");
      const stopped = stopProgram(program, graceMs);
      await vi.advanceTimersByTimeAsync(graceMs);
      expect(steps).toEqual(["endInput", "terminate"]);
      await vi.advanceTimersByTimeAsync(graceMs);
      expect(await stopped).toEqual({ code: null, signal: "SIGKILL" });
      expect(steps).toEqual(["endInput", "terminate", "kill"]);
    });

    it("leaves no timer waiting once the program has ended", async () => {
      const { program } = programEndingAt("endInput");
      await stopProgram(program, graceMs);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("waits for the forced program to end, however long that takes, without another signal", async () => {
      const { program, steps } = programEndingAt(undefined);
      let settled = false;
      void stopProgram(program, graceMs).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(10 * graceMs);
      expect(steps).toEqual(["endInput", "terminate", "kill"]);
      expect(settled).toBe(false);
    });
  });
});
