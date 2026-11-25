import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { defaultPlacementRules, type PlacementProposal, type SeatNow } from "./placement-rules.ts";
import { type ProposalTextInput, proposalText } from "./proposal-text.ts";

const at = "2026-11-22T12:00:00.000Z";

function seat(id: string, session: number, week: number): SeatNow {
  return {
    id,
    role: "pool",
    status: "active",
    resetGroup: "group-g",
    manualResetUsed: false,
    readable: true,
    session: {
      usedPercent: session,
      percentPerHour: undefined,
      resetsAt: "2026-11-22T14:00:00.000Z",
    },
    week: { usedPercent: week, percentPerHour: undefined, resetsAt: "2026-11-26T08:00:00.000Z" },
  };
}

function input(proposal: PlacementProposal, placements: [string, string][]): ProposalTextInput {
  return {
    proposal,
    seats: [seat("seat-a", 82, 40), seat("seat-b", 10, 20), seat("seat-c", 30, 95)],
    placements: new Map(placements),
    agentNames: new Map([["agent-1", "Acme Writer"]]),
    rules: defaultPlacementRules,
    at,
  };
}

verifies("paperclip.seats-check-proposal", () => {
  test("a move names the agent, both seats and the reason in numbers, and says nothing has moved", () => {
    const text = proposalText(
      input(
        {
          moves: [{ agentId: "agent-1", from: "seat-a", to: "seat-b", reason: "session-full" }],
          resetAdvice: [],
        },
        [["agent-1", "seat-a"]],
      ),
    );
    expect(text).toContain("Nothing has moved: the board applies these.");
    expect(text).toContain("- Acme Writer: seat-a → seat-b (5-hour window at 82%).");
  });

  test("it shows how many agents each receiving seat would hold, so a pile-up is visible", () => {
    const moves = ["agent-2", "agent-3", "agent-4"].map((agentId) => ({
      agentId,
      from: "seat-a",
      to: "seat-b",
      reason: "session-full" as const,
    }));
    const text = proposalText(
      input({ moves, resetAdvice: [] }, [
        ["agent-2", "seat-a"],
        ["agent-3", "seat-a"],
        ["agent-4", "seat-a"],
        ["agent-5", "seat-b"],
      ]),
    );
    expect(text).toContain("Seats after these moves. At most 3 agents per seat.");
    expect(text).toContain("- seat-b: 4 agents (1 now).");
  });

  test("it says so when no seat can take an agent", () => {
    const text = proposalText(
      input(
        {
          moves: [{ agentId: "agent-2", from: "seat-c", to: undefined, reason: "week-full" }],
          resetAdvice: [],
        },
        [["agent-2", "seat-c"]],
      ),
    );
    expect(text).toContain("- agent-2: off seat-c (week at 95%), but no seat can take it now.");
  });

  test("reset advice names the seat, its week and its reset group", () => {
    const text = proposalText(input({ moves: [], resetAdvice: ["seat-c"] }, []));
    expect(text).toContain(
      "- **Manual reset worth it:** seat-c is at 95% of its week, which resets at 2026-11-26T08:00:00.000Z, and reset group group-g hasn't used its manual reset.",
    );
    expect(text).not.toContain("Seats after these moves");
  });

  test("with nothing to propose there is nothing to post", () => {
    expect(
      proposalText(input({ moves: [], resetAdvice: [] }, [["agent-1", "seat-a"]])),
    ).toBeUndefined();
  });
});
