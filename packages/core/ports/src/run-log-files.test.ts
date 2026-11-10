import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkRunId, formatLogLines, isRunId, parseLogLines } from "./index.ts";

function entered(runId: string, seq: number): RunEvent {
  return { runId, seq, at: "2026-01-01T00:00:00.000Z", type: "state.entered", state: "s" };
}

// The folder run stores of fs-node and fs-tauri use these rules on real files; this checks them on their own.
verifies("ports.run-log-files", () => {
  describe("formatLogLines and parseLogLines", () => {
    it("reads back what formatLogLines writes, one event per line", () => {
      const events = [entered("r1", 1), entered("r1", 2)];
      const lines = formatLogLines(events);
      expect(lines.split("\n")).toHaveLength(3);
      expect(parseLogLines(lines, "r1", "r1.jsonl")).toEqual(events);
    });

    it("reads an empty log as no events", () => {
      expect(parseLogLines("", "r1", "r1.jsonl")).toEqual([]);
    });

    it("refuses text that doesn't end in a line break, which the adapter cuts off first", () => {
      const torn = `${formatLogLines([entered("r1", 1)])}${JSON.stringify(entered("r1", 2))}`;
      expect(() => parseLogLines(torn, "r1", "r1.jsonl")).toThrow(RangeError);
    });

    it("names the file and line of a line that is broken", () => {
      const lines = `${formatLogLines([entered("r1", 1)])}{"not an event"\n`;
      expect(() => parseLogLines(lines, "r1", "r1.jsonl")).toThrow(
        /^Broken run log r1\.jsonl, line 2: /u,
      );
    });

    it("refuses a line that holds another run's event, or the wrong seq", () => {
      expect(() => parseLogLines(formatLogLines([entered("r2", 1)]), "r1", "r1.jsonl")).toThrow(
        "Broken run log r1.jsonl, line 1: it holds event 1 of run r2.",
      );
      expect(() => parseLogLines(formatLogLines([entered("r1", 2)]), "r1", "r1.jsonl")).toThrow(
        "Broken run log r1.jsonl, line 1: it holds event 2 of run r1.",
      );
    });
  });

  describe("checkRunId", () => {
    it.each(["r1", "run_2026-01-01.a", "_r", "-r", "a".repeat(128), "con1", "nulls", "com10"])(
      "accepts %j",
      (runId) => {
        expect(isRunId(runId)).toBe(true);
        expect(() => checkRunId(runId)).not.toThrow();
      },
    );

    it.each([
      "",
      ".hidden",
      "..",
      "../r1",
      "a/b",
      "a\\b",
      "/r1",
      "r 1",
      "ré",
      "a".repeat(129),
      "con",
      "NUL.jsonl",
      "Com1",
      "lpt9.x",
    ])("refuses %j", (runId) => {
      expect(isRunId(runId)).toBe(false);
      expect(() => checkRunId(runId)).toThrow(RangeError);
    });
  });
});
