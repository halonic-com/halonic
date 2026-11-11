import type { RoutineTickResult } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import { watchReport } from "./watch-report.ts";

/** A tick whose run due at `at` didn't start; it prints one ✕ line. */
function failedTick(key: string, at: string): RoutineTickResult {
  return {
    started: [],
    failed: [{ key, at, error: new Error("the workflow is gone") }],
    lastRunNotSaved: [],
    queued: [],
    skipped: [],
    unavailable: [],
    skipsNotSaved: [],
  };
}

function reportOnLines() {
  const lines: string[] = [];
  const report = watchReport(
    { printAhead: (line) => lines.push(plainText(line)), debug: () => {} },
    () => ({ now: new Date("2026-11-10T15:00:10.000Z"), timeZone: "UTC" }),
    [],
  );
  return { lines, report };
}

verifies("cli.commands.routines.watch", () => {
  it("holds the run lines of ticks that end before the watching line, and prints them in order once it is out", () => {
    const { lines, report } = reportOnLines();

    // A scheduled tick that ends while the catch-up tick is still going, then the catch-up tick.
    report.tick(failedTick("support/hourly", "2026-11-10T15:00:00.000Z"));
    report.tick(failedTick("support/daily", "2026-11-10T09:00:00.000Z"));
    expect(lines).toEqual([]);

    lines.push("Watching 2 routines in acme. Stop with Ctrl C.");
    report.open();
    report.tick(failedTick("support/hourly", "2026-11-10T16:00:00.000Z"));

    expect(lines).toEqual([
      "Watching 2 routines in acme. Stop with Ctrl C.",
      "✕ support/hourly didn't start · due 15:00 · see why with --debug",
      "✕ support/daily didn't start · due 09:00 · see why with --debug",
      "✕ support/hourly didn't start · due 16:00 · see why with --debug",
    ]);
  });
});
