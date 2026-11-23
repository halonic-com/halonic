import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  monitorPolicy,
  readBlockedBy,
  readFinishRunParams,
  readMonitor,
  readSetNextStepParams,
} from "./next-step.ts";

verifies("paperclip.task-next-step", () => {
  describe("the monitor", () => {
    test("defaults to 4 checks on github and gives up after the last one", () => {
      const request = readMonitor({ inMinutes: 360, ref: "halonic-com/halonic#5486" });
      expect(request).toEqual({
        inMinutes: 360,
        ref: "halonic-com/halonic#5486",
        service: "github",
        maxChecks: 4,
      });
      const policy = monitorPolicy(request, new Date("2026-11-23T15:00:00Z"));
      expect(policy.nextCheckAt).toBe("2026-11-23T21:00:00.000Z");
      expect(policy.timeoutAt).toBe("2026-11-24T21:00:00.000Z");
    });

    test.each([
      [{ inMinutes: 5, ref: "x#1" }, "monitor.inMinutes must be a whole number from 15 to 1440."],
      [
        { inMinutes: 20, ref: "" },
        "monitor.ref must be a short text, such as halonic-com/halonic#5486.",
      ],
      [
        { inMinutes: 20, ref: "x#1", maxChecks: 9 },
        "monitor.maxChecks must be a whole number from 1 to 8.",
      ],
    ])("refuses %j", (monitor, message) => {
      expect(() => readMonitor(monitor)).toThrow(message);
    });
  });

  test("blockedBy takes task identifiers, without repeats, and nothing else", () => {
    expect(readBlockedBy(["HAL-16989", "HAL-16989", "HAL-17012"])).toEqual([
      "HAL-16989",
      "HAL-17012",
    ]);
    expect(() => readBlockedBy([])).toThrow("blockedBy must list 1 to 10 tasks");
    expect(() => readBlockedBy(["16989"])).toThrow("blockedBy must list 1 to 10 tasks");
  });

  test.each([
    [
      { task: "HAL-1", status: "todo", comment: "x" },
      "status must be in_progress (with a monitor) or blocked",
    ],
    [
      { task: "HAL-1", status: "blocked", blockedBy: ["HAL-2"], monitor: {}, comment: "x" },
      "a blocked task's monitor never fires",
    ],
    [{ task: "HAL-1", status: "blocked", blockedBy: ["HAL-2"] }, "comment must say what happened"],
    [
      { task: "HAL-1", status: "blocked", blockedBy: ["HAL-2"], comment: "x".repeat(20_001) },
      "comment is 20001 characters; the most is 20000.",
    ],
  ])("set_next_step refuses %j", (params, message) => {
    expect(() => readSetNextStepParams(params)).toThrow(message);
  });

  test("finish_run needs a known outcome, and a name for a handoff", () => {
    expect(() =>
      readFinishRunParams({ task: "HAL-1", outcome: "in_review", comment: "x" }),
    ).toThrow("outcome must be done, handoff (with to) or blocked (with blockedBy).");
    expect(() => readFinishRunParams({ task: "HAL-1", outcome: "handoff", comment: "x" })).toThrow(
      "to must be a short text, such as Liam.",
    );
  });
});
