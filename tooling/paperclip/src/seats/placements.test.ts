import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { placementChanges } from "./placements.ts";
import type { Placement } from "./records.ts";

const earlier = "2026-11-22T08:00:00.000Z";
const now = "2026-11-22T09:00:00.000Z";

function onSeat(agentId: string, seatId: string): Placement {
  return { agentId, seatId, from: earlier, to: undefined, source: "observed" };
}

verifies("paperclip.seats-placements", () => {
  test("an agent still on its seat changes nothing", () => {
    const seatsNow = new Map([["agent-1", "seat-a"]]);
    expect(placementChanges([onSeat("agent-1", "seat-a")], seatsNow, now, "observed")).toEqual({
      closed: [],
      opened: [],
    });
  });

  test("a move ends the old placement and starts a new one at the same time", () => {
    const seatsNow = new Map([["agent-1", "seat-b"]]);
    expect(placementChanges([onSeat("agent-1", "seat-a")], seatsNow, now, "observed")).toEqual({
      closed: [{ ...onSeat("agent-1", "seat-a"), to: now }],
      opened: [
        { agentId: "agent-1", seatId: "seat-b", from: now, to: undefined, source: "observed" },
      ],
    });
  });

  test("an agent that left its seat or is gone ends its placement", () => {
    const seatsNow = new Map<string, string | undefined>([["agent-1", undefined]]);
    const open = [onSeat("agent-1", "seat-a"), onSeat("agent-2", "seat-a")];
    const changes = placementChanges(open, seatsNow, now, "observed");
    expect(changes.closed.map((placement) => [placement.agentId, placement.to])).toEqual([
      ["agent-1", now],
      ["agent-2", now],
    ]);
    expect(changes.opened).toEqual([]);
  });

  test("a new agent on a seat starts a placement with the given source", () => {
    const seatsNow = new Map([["agent-3", "seat-a"]]);
    expect(placementChanges([], seatsNow, now, "board").opened).toEqual([
      { agentId: "agent-3", seatId: "seat-a", from: now, to: undefined, source: "board" },
    ]);
  });

  test("ended placements are left alone", () => {
    const ended: Placement = { ...onSeat("agent-1", "seat-a"), to: earlier };
    const seatsNow = new Map([["agent-1", "seat-a"]]);
    expect(placementChanges([ended], seatsNow, now, "observed")).toEqual({
      closed: [],
      opened: [{ ...onSeat("agent-1", "seat-a"), from: now }],
    });
  });
});
