import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Calibration } from "./calibrate.ts";
import type { DemandProfile } from "./demand.ts";
import { moveEffects, resetEffects, withMove } from "./effects.ts";
import type { SeatForecastInput } from "./seat-forecast.ts";
import { hourMs, type Placement, type Seat } from "./types.ts";

const now = "2026-11-22T12:00:00.000Z";
const nowMs = Date.parse(now);
const at = (hours: number) => new Date(nowMs + hours * hourMs).toISOString();

const seat = (id: string): Seat => ({
  id,
  role: "pool",
  plan: "max",
  resetGroup: "group-1",
  manualResetUsed: false,
  status: "active",
});

/** A made-up agent using one million output tokens every hour. */
const agent = (agentId: string): DemandProfile => ({
  agentId,
  model: "claude-opus-x",
  mix: { input: 0, cached: 0, output: 1 },
  idle: false,
  currentRate: 1_000_000,
  weekProfile: new Array<number>(168).fill(1_000_000),
  spread: 2,
});

const placement = (agentId: string, seatId: string): Placement => ({
  agentId,
  seatId,
  from: at(-24),
  to: undefined,
  source: "supervisor",
});

/** One weekly point per million output tokens. */
const weekFit: Calibration = {
  plan: "max",
  model: "claude-opus-x",
  window: "week",
  day: "2026-11-22",
  from: at(-168),
  to: at(-1),
  pointsPerMillion: { input: 0, cached: 0, output: 1 },
  quality: { steps: 500, medianErrorPoints: 1, p90ErrorPoints: 2 },
  weekShift: undefined,
  shifted: false,
};

const input: SeatForecastInput = {
  now,
  seats: [seat("seat-a"), seat("seat-b")],
  readings: [
    { seatId: "seat-a", window: "week", at: now, usedPercent: 60, resetsAt: at(30) },
    { seatId: "seat-b", window: "week", at: now, usedPercent: 10, resetsAt: at(140) },
  ],
  placements: [placement("agent-1", "seat-a"), placement("agent-2", "seat-a")],
  profiles: [agent("agent-1"), agent("agent-2")],
  calibrations: [weekFit],
  modelWindows: {},
};

verifies("paperclip.seats-proposal-effects", () => {
  test("a move ends the agent's placement at its time and starts one on the target seat", () => {
    const placements = withMove(input.placements, {
      agentId: "agent-2",
      toSeatId: "seat-b",
      at: at(2),
    });
    expect(placements.filter((entry) => entry.agentId === "agent-2")).toEqual([
      { ...placement("agent-2", "seat-a"), to: at(2) },
      { agentId: "agent-2", seatId: "seat-b", from: at(2), to: undefined, source: "job" },
    ]);
    expect(placements.filter((entry) => entry.agentId === "agent-1")).toEqual([
      placement("agent-1", "seat-a"),
    ]);
  });

  test("a move shows both seats' % at reset today and after the move", () => {
    const [effect] = moveEffects(input, [{ agentId: "agent-2", toSeatId: "seat-b", at: now }]);
    expect(effect?.fromSeatId).toBe("seat-a");
    const seatA = effect?.windows.find((change) => change.seatId === "seat-a");
    const seatB = effect?.windows.find((change) => change.seatId === "seat-b");
    expect(seatA?.before.p50).toBe(100);
    expect(seatA?.after.p50).toBeLessThan(seatA?.before.p50 ?? 0);
    expect(seatB?.after.p50).toBeGreaterThan(seatB?.before.p50 ?? 0);
    expect(effect?.windows).toHaveLength(2);
  });

  test("each move is forecast on its own against today's forecast", () => {
    const moves = [
      { agentId: "agent-1", toSeatId: "seat-b", at: now },
      { agentId: "agent-2", toSeatId: "seat-b", at: now },
    ];
    const [first, second] = moveEffects(input, moves);
    expect(first?.windows).toEqual(second?.windows);
  });

  test("a manual reset empties the seat now and pushes back the pool's run-out", () => {
    const [effect] = resetEffects(input, ["seat-a"]);
    expect(effect?.windows.map((change) => change.seatId)).toEqual(["seat-a"]);
    expect(effect?.poolBefore.p90).toBeDefined();
    const before = Date.parse(effect?.poolBefore.p90 ?? "");
    const after = effect?.poolAfter.p90 === undefined ? Infinity : Date.parse(effect.poolAfter.p90);
    expect(after).toBeGreaterThan(before);
  });
});
