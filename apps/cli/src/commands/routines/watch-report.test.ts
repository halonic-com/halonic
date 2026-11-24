import type { RoutineTickResult } from "@halonicjs/app/routines";
import type { RunSummary } from "@halonicjs/events";
import type { PlacedRoutine } from "@halonicjs/routines";
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
    refusedLoops: [],
    unavailable: [],
    skipsSaved: [],
    skipsNotSaved: [],
  };
}

/** A routine on the signal `paid`, as the last tick listed it. */
const onPaid = {
  hub: "billing",
  routine: { id: "on-paid", name: "On paid", trigger: { signal: { name: "paid" } } },
} as unknown as PlacedRoutine;

/** A tick on the signal `paid`, sent at `at`: one start, and one start the loop guard refused. */
function signalTick(at: string): RoutineTickResult {
  // Only the trigger and the id of a started run are read for its line.
  const started = {
    id: "01jd8qzzzzzzzzzzzzzzzzzzzz",
    startedAt: at,
    trigger: { type: "signal", routineId: "billing/on-paid", at, signalId: "r1:3" },
  } as unknown as RunSummary;
  return {
    ...failedTick("billing/on-paid", at),
    failed: [],
    started: [started],
    refusedLoops: [{ key: "billing/on-paid", at }],
  };
}

function reportOnLines(routines: readonly PlacedRoutine[] = []) {
  const lines: string[] = [];
  const report = watchReport(
    { printAhead: (line) => lines.push(plainText(line)), debug: () => {} },
    () => ({ now: new Date("2026-11-10T15:00:10.000Z"), timeZone: "UTC" }),
    () => routines,
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

  it("names the signal a run started on, and prints a dim line for a start the loop guard refused", () => {
    const { lines, report } = reportOnLines([onPaid]);
    report.open();
    report.tick(signalTick("2026-11-10T15:00:02.000Z"));

    expect(lines[0]).toMatch(/^✓ Started On paid · run \S+ · signal paid 15:00$/);
    expect(lines[1]).toBe(
      'On paid didn\'t start on signal paid: it may come from routines starting each other. Add a "when" that stops the loop.',
    );
  });
});
