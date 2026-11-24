import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { defaultTimings, type SimDay, type SimPull } from "./day.ts";
import {
  frontOfLine,
  jumpOver3,
  jumpOver8,
  mergerBefore1815,
  type SimReport,
  simulate,
} from "./simulate.ts";

function ready(number: number, at: string, changes: Partial<SimPull> = {}): SimPull {
  return {
    number,
    readyAt: `2026-11-24T${at}:00.000Z`,
    fastTrack: false,
    failsOnce: false,
    conflictsAt: null,
    files: [],
    ...changes,
  };
}

/** `count` pull requests ready one a minute from 08:00. */
function steady(count: number): SimPull[] {
  return Array.from({ length: count }, (_, index) =>
    ready(index + 1, `08:${String(index).padStart(2, "0")}`),
  );
}

function day(pulls: SimPull[]): SimDay {
  return { date: "2026-11-24", pulls, timings: defaultTimings, recorded: null };
}

function cancelled(report: SimReport): number {
  return report.groupsCancelled.byJumps + report.groupsCancelled.byRemovals;
}

/** Five queued when a fast-track pull request is ready: over 3, not over 8. */
const fiveAhead = day([...steady(6), ready(100, "08:05", { fastTrack: true })]);

/** Twelve queued when it is ready, and a group that fails behind it. */
const twelveAhead = day([
  ...steady(12).map((pull) => (pull.number === 10 ? { ...pull, failsOnce: true } : pull)),
  ready(200, "08:12", { fastTrack: true }),
]);

verifies("paperclip.merge-control-sim", () => {
  test("jump >3 and jump >8 cancel a different number of groups on the same day", () => {
    const over3 = simulate(fiveAhead, jumpOver3);
    const over8 = simulate(fiveAhead, jumpOver8);
    expect({ jumps: over3.jumps, cancelled: cancelled(over3) }).toEqual({ jumps: 1, cancelled: 5 });
    expect({ jumps: over8.jumps, cancelled: cancelled(over8) }).toEqual({ jumps: 0, cancelled: 0 });
    expect(over3.merged).toBe(7);
    expect(over8.merged).toBe(7);
  });

  test("front of the line without a rebuild cancels fewer groups than jump >8", () => {
    const today = simulate(twelveAhead, jumpOver8);
    const front = simulate(twelveAhead, frontOfLine);
    expect(today.jumps).toBe(1);
    expect(cancelled(today)).toBe(8);
    expect(today.runnerMinutesLost).toBeGreaterThan(0);
    expect({ jumps: front.jumps, cancelled: cancelled(front) }).toEqual({ jumps: 0, cancelled: 0 });
    expect(front.requeues).toBe(1);
    expect(front.merged).toBe(13);
  });

  test("a failed group rebuilds the groups behind it and its pull request merges after a new head", () => {
    const report = simulate(
      day(steady(4).map((pull) => ({ ...pull, failsOnce: pull.number === 2 }))),
      jumpOver8,
    );
    expect(report.groupsCancelled).toEqual({ byJumps: 0, byRemovals: 0, byFailures: 2 });
    expect(report.merged).toBe(4);
    expect(report.timeToMerge.other.p90).toBeGreaterThan(defaultTimings.refixMinutes);
  });

  test("a pull request that conflicts in the queue is taken out and its groups behind rebuild", () => {
    const pulls = steady(3).map((pull) =>
      pull.number === 1 ? { ...pull, conflictsAt: "2026-11-24T08:05:00.000Z" } : pull,
    );
    const report = simulate(day(pulls), jumpOver8);
    expect(report.groupsCancelled.byRemovals).toBe(3);
    expect(report.merged).toBe(3);
  });

  test("with short runners groups build slower, and only a rule set without the capacity gate jumps", () => {
    const short = { ...fiveAhead, timings: { ...defaultTimings, runnerGroups: 3 } };
    const merger = simulate(short, mergerBefore1815);
    const gated = simulate(short, jumpOver3);
    expect({ jumps: merger.jumps, cancelled: cancelled(merger) }).toEqual({
      jumps: 1,
      cancelled: 5,
    });
    expect(gated.jumps).toBe(0);
    expect(gated.queueWait.p90).toBeGreaterThan(simulate(fiveAhead, jumpOver3).queueWait.p90 ?? 0);
  });

  test("the same day and rule set give the same report", () => {
    expect(simulate(twelveAhead, jumpOver8)).toEqual(simulate(twelveAhead, jumpOver8));
  });
});
