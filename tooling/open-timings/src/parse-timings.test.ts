import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openProblem, parseTimings } from "./parse-timings.ts";
import { formatSummary } from "./summary.ts";

const beside = [
  "2026-11-26T11:00:01Z studio: started",
  "2026-11-26T11:00:05Z timings: the agent host started beside the shell: start 4000 ms (4000 ms in all)",
  "2026-11-26T11:00:09Z timings: Studio's start was ready 9001 ms after the page loaded",
  "2026-11-26T11:00:10Z timings: a window's engine answered in 3250 ms, asked 1200 ms after the page loaded",
].join("\r\n");

verifies("open-timings.summary", () => {
  describe("parseTimings", () => {
    it("reads the start, ready and engine lines into rows of step and ms", () => {
      const timings = parseTimings(beside);
      expect(timings.rows).toEqual([
        { step: "start", ms: 4000 },
        { step: "ready", ms: 9001 },
        { step: "engine", ms: 3250 },
        { step: "open", ms: 4450 },
      ]);
      expect(openProblem(timings, 10_000)).toBeUndefined();
    });

    it("lists each step of a start in the distro under the whole", () => {
      const timings = parseTimings(
        "2026-11-26T11:00:05Z timings: the agent host started in the distro: wsl 812 ms, security update 90 ms, start 4000 ms (4902 ms in all)",
      );
      expect(timings.rows).toEqual([
        { step: "start", ms: 4902 },
        { step: "start: wsl", ms: 812 },
        { step: "start: security update", ms: 90 },
        { step: "start: start", ms: 4000 },
      ]);
    });

    it("keeps the first start and the first window's engine", () => {
      const timings = parseTimings(
        `${beside}\n2026-11-26T11:01:00Z timings: a window's engine answered in 2 ms, asked 70000 ms after the page loaded`,
      );
      expect(timings.openMs).toBe(4450);
    });

    it("skips lines from other sources and texts it doesn't know", () => {
      const timings = parseTimings(
        [
          "2026-11-26T11:00:05Z engine: a window's engine answered in 3 ms",
          "2026-11-26T11:00:05Z timings: something new 5 ms",
        ].join("\n"),
      );
      expect(timings.rows).toEqual([]);
      expect(openProblem(timings, 10_000)).toBe("no window's engine answered");
    });
  });

  describe("openProblem", () => {
    it("flags an open over the 10 s budget", () => {
      const timings = parseTimings(
        "2026-11-26T11:00:10Z timings: a window's engine answered in 9500 ms, asked 1000 ms after the page loaded",
      );
      expect(openProblem(timings, 10_000)).toBe("opening took 10500 ms, over the 10000 ms budget");
    });

    it("counts the engine's own wait when the page's load wasn't noted", () => {
      const timings = parseTimings(
        "2026-11-26T11:00:10Z timings: a window's engine answered in 12000 ms",
      );
      expect(timings.openMs).toBeUndefined();
      expect(openProblem(timings, 10_000)).toBe("opening took 12000 ms, over the 10000 ms budget");
    });

    it("flags a refused engine", () => {
      const timings = parseTimings(
        "2026-11-26T11:00:10Z timings: a window's engine was refused (engine_failed) after 60000 ms, asked 1500 ms after the page loaded",
      );
      expect(timings.rows).toContainEqual({ step: "engine", ms: 60_000 });
      expect(openProblem(timings, 10_000)).toBe("the window's engine was refused (engine_failed)");
    });
  });

  describe("formatSummary", () => {
    it("writes the rows as a Markdown table and says the open was within budget", () => {
      expect(formatSummary(parseTimings(beside))).toBe(
        [
          "## Studio's open timings",
          "",
          "| Step | ms |",
          "| --- | ---: |",
          "| start | 4000 |",
          "| ready | 9001 |",
          "| engine | 3250 |",
          "| open | 4450 |",
          "",
          "Within the 10000 ms budget.",
          "",
        ].join("\n"),
      );
    });

    it("says when the log held no timings and flags the open", () => {
      const summary = formatSummary(parseTimings(""));
      expect(summary).toContain("`shell.log` held no `timings` lines.");
      expect(summary).toContain("**Flagged:** no window's engine answered.");
    });
  });
});
