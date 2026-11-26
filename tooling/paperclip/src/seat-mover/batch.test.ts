import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type AgentPlace, breaks, type Seat, targetRefusal } from "./checklist.ts";
import { planMoves } from "./plan.ts";
import { agent, now, seat, settings } from "./seat-mover.test-helper.ts";

/** A small fixed-seed generator, so every run checks the same states. */
function random(seed: number) {
  let state = seed;
  return (below: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % below;
  };
}

const names = ["liam", "julian", "elena", "priya", "tomas", "mateo", "kim", "nina", "mara", "noah"];

function scenario(seed: number): { seats: Seat[]; agents: AgentPlace[] } {
  const pick = random(seed);
  const seats = Array.from({ length: 3 + pick(6) }, (_, index) =>
    seat(index === 0 ? "Admin" : `S${index}`, pick(100), pick(100), {
      method: pick(10) === 0 ? "api_key" : "subscription",
      quotaHit: pick(12) === 0,
      weekResetsAt: new Date(now.getTime() + (1 + pick(120)) * 3_600_000).toISOString(),
    }),
  );
  const agents = names.map((key) =>
    agent(key, seats[pick(seats.length)]?.name, { parked: pick(6) === 0, paused: pick(8) === 0 }),
  );
  return { seats, agents };
}

verifies("paperclip.seat-mover-checklist", () => {
  test("a batch never leaves a break on a seat it sends agents to, over 500 random states", () => {
    let moved = 0;
    let stuck = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const { seats, agents } = scenario(seed);
      const plan = planMoves(seats, agents, settings, now);
      const placement = new Map<string, string>();
      for (const one of agents) {
        if (one.connectionId !== undefined) {
          placement.set(one.id, one.connectionId);
        }
      }
      // Each move, in order, passes the whole checklist against the placement so far.
      for (const move of plan.moves) {
        expect(
          targetRefusal(move.to, move.agent, placement, agents, settings, now),
          `seed ${seed}`,
        ).toBe(undefined);
        placement.set(move.agent.id, move.to.connectionId);
      }
      const bySeat = new Map(seats.map((one) => [one.connectionId, one]));
      const targets = plan.moves.map((move) => move.to.connectionId);
      expect(breaks(targets, bySeat, placement, agents, settings), `seed ${seed}`).toEqual([]);
      expect(plan.refused).toEqual([]);
      moved += plan.moves.length;
      stuck += plan.stuck.length;
    }
    // The states are varied enough to move many agents and leave some stuck.
    expect(moved).toBeGreaterThan(500);
    expect(stuck).toBeGreaterThan(50);
  });

  test("breaks names each rule a placement breaks", () => {
    const seats = [
      seat("Admin", 0, 0),
      seat("Api", 0, 0, { method: "api_key" }),
      seat("R", 0, 0),
      seat("H", 0, 0),
    ];
    const agents = [
      agent("kim", "Admin"),
      agent("nina", "Api"),
      agent("liam", "R"),
      agent("mara", "R"),
      agent("elena", "H"),
      agent("priya", "H"),
      agent("tomas", "H"),
    ];
    const placement = new Map(agents.map((one) => [one.id, one.connectionId ?? ""]));
    const bySeat = new Map(seats.map((one) => [one.connectionId, one]));
    const found = breaks(bySeat.keys(), bySeat, placement, agents, settings);
    expect(found.map((one) => one.rule)).toEqual([
      "d-admin",
      "e-paid-api",
      "b-reviewer-not-alone",
      "c-heavy-limit",
    ]);
  });
});
