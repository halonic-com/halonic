import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type AgentActivity, demandAt, demandProfile, hourOfWeek, quantile } from "./demand.ts";
import { type AgentUsage, hourMs, stepMs } from "./types.ts";

// Sunday 22 Nov 2026, 12:00 UTC.
const now = "2026-11-22T12:00:00.000Z";
const nowMs = Date.parse(now);

const busy: AgentActivity = {
  agentId: "agent-1",
  model: "opus",
  runningRuns: 1,
  queuedRuns: 0,
  openTasks: 2,
  cap: 2,
};
const resting: AgentActivity = { ...busy, runningRuns: 0, openTasks: 0 };

/** Made-up history: `perHour(atMs)` tokens in each hour of the last 14 days, all output. */
function history(perHour: (hourStartMs: number) => number, agentId = "agent-1"): AgentUsage[] {
  const rows: AgentUsage[] = [];
  for (let hour = 14 * 24; hour >= 1; hour -= 1) {
    const hourStartMs = nowMs - hour * hourMs;
    for (let bucket = 0; bucket < 6; bucket += 1) {
      rows.push({
        agentId,
        seatId: "seat-a",
        model: "opus",
        bucketStart: new Date(hourStartMs + bucket * stepMs).toISOString(),
        tokens: { input: 0, cached: 0, output: perHour(hourStartMs) / 6 },
      });
    }
  }
  return rows;
}

/** Works 09:00–17:00 UTC at 6 M tokens an hour, and 0.1 M otherwise. */
const officeHours = (atMs: number) => {
  const hour = new Date(atMs).getUTCHours();
  return hour >= 9 && hour < 17 ? 6_000_000 : 100_000;
};

verifies("paperclip.seats-demand", () => {
  test("hours of the week count from Sunday 00:00 UTC", () => {
    expect(hourOfWeek(Date.parse("2026-11-22T00:30:00.000Z"))).toBe(0);
    expect(hourOfWeek(Date.parse("2026-11-23T13:00:00.000Z"))).toBe(37);
  });

  test("a busy agent's next hour is close to its last two hours", () => {
    const profile = demandProfile(busy, history(officeHours), now);
    expect(profile.idle).toBe(false);
    expect(profile.currentRate).toBeCloseTo(6_000_000, 0);
    expect(demandAt(profile, nowMs, nowMs).p50).toBeCloseTo(6_000_000, 0);
  });

  test("further ahead, demand follows the agent's usual hour of the week", () => {
    const profile = demandProfile(busy, history(officeHours), now);
    const nightMs = Date.parse("2026-11-23T02:00:00.000Z");
    const night = demandAt(profile, nowMs, nightMs);
    expect(night.p50).toBeLessThan(400_000);
    const nextMorning = demandAt(profile, nowMs, Date.parse("2026-11-23T10:00:00.000Z"));
    expect(nextMorning.p50).toBeGreaterThan(5_000_000);
  });

  test("an agent with no work drops to its idle rate", () => {
    const profile = demandProfile(resting, history(officeHours), now);
    expect(profile.idle).toBe(true);
    expect(profile.currentRate).toBeCloseTo(100_000, 0);
    expect(demandAt(profile, nowMs, nowMs).p50).toBeCloseTo(100_000, 0);
  });

  test("P90 sits above P50 by how much the agent's hours scatter", () => {
    const steady = demandProfile(
      busy,
      history(() => 1_000_000),
      now,
    );
    expect(steady.spread).toBe(1);
    const bursty = demandProfile(
      busy,
      history((atMs) => (Math.floor(atMs / hourMs) % 5 === 0 ? 5_000_000 : 500_000)),
      now,
    );
    expect(bursty.spread).toBeGreaterThan(1.5);
    const hour = demandAt(bursty, nowMs, nowMs + hourMs);
    expect(hour.p90).toBeCloseTo(hour.p50 * bursty.spread, 6);
  });

  test("only the agent's own tokens count, and their mix is kept", () => {
    const usage = [
      ...history(() => 1_000_000),
      ...history(() => 9_000_000, "agent-2"),
      {
        agentId: "agent-1",
        seatId: "seat-a",
        model: "opus",
        bucketStart: new Date(nowMs - hourMs).toISOString(),
        tokens: { input: 0, cached: 336_000_000, output: 0 },
      },
    ];
    const profile = demandProfile(busy, usage, now);
    expect(profile.mix.cached).toBeCloseTo(0.5, 6);
    expect(profile.mix.output).toBeCloseTo(0.5, 6);
    expect(profile.model).toBe("opus");
  });

  test("an agent with no history has no demand and a default spread", () => {
    const profile = demandProfile(busy, [], now);
    expect(profile.currentRate).toBe(0);
    expect(profile.spread).toBe(2);
    expect(demandAt(profile, nowMs, nowMs + 5 * hourMs)).toEqual({ p50: 0, p90: 0 });
  });

  test("quantiles interpolate between values", () => {
    expect(quantile([0, 10], 0.9)).toBeCloseTo(9, 6);
    expect(quantile([], 0.5)).toBe(0);
  });
});
