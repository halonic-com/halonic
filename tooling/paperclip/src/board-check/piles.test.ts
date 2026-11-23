import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { emptyPiles, planPiles, queuedPiles, readPiles } from "./piles.ts";

const now = new Date("2026-11-22T14:00:00Z");
const names = new Map([
  ["agent-ravi", "Ravi"],
  ["agent-liam", "Liam"],
]);
const options = { boardCheckerTaskId: "task-checker", names, now };
const runs = (agentId: string, count: number, status = "queued") =>
  Array.from({ length: count }, (_, index) => ({ id: `${agentId}-${index}`, agentId, status }));

verifies("paperclip.board-check-piles", () => {
  test("counts each agent's queued runs once, from five on, largest first", () => {
    const seenTwice = runs("agent-liam", 5);
    expect(
      queuedPiles([
        ...runs("agent-ravi", 6),
        ...seenTwice,
        ...seenTwice,
        ...runs("agent-ravi", 3, "running"),
        ...runs("agent-mateo", 4),
      ]),
    ).toEqual([
      { agentId: "agent-ravi", queued: 6 },
      { agentId: "agent-liam", queued: 5 },
    ]);
  });

  test("reports a new pile once, and again only after the queue dropped under five", () => {
    const pile = { piles: [{ agentId: "agent-ravi", queued: 6 }], partial: false };
    const first = planPiles(emptyPiles, pile, options);
    expect(first.writes).toEqual([
      {
        kind: "comment",
        taskId: "task-checker",
        body: "Queued runs piling up (5 or more for one agent): Ravi 6.",
      },
    ]);
    expect(planPiles(first.record, pile, options).writes).toEqual([]);
    const dropped = planPiles(first.record, { piles: [], partial: false }, options);
    expect(dropped.writes).toEqual([]);
    expect(planPiles(dropped.record, pile, options).writes).toHaveLength(1);
  });

  test("names every pile when one agent is new, and says when tasks were left unread", () => {
    const reported = { ...emptyPiles, reported: ["agent-ravi"] };
    const plan = planPiles(
      reported,
      {
        piles: [
          { agentId: "agent-ravi", queued: 7 },
          { agentId: "agent-liam", queued: 5 },
        ],
        partial: true,
      },
      options,
    );
    expect(plan.writes).toEqual([
      {
        kind: "comment",
        taskId: "task-checker",
        body: "Queued runs piling up (5 or more for one agent): Ravi 7, Liam 5. Only some tasks were read this pass.",
      },
    ]);
    expect(plan.record).toEqual({
      at: "2026-11-22T14:00:00.000Z",
      piles: [
        { agentId: "agent-ravi", queued: 7 },
        { agentId: "agent-liam", queued: 5 },
      ],
      partial: true,
      reported: ["agent-ravi", "agent-liam"],
    });
  });

  test("starts afresh from a malformed record", () => {
    expect(readPiles({ piles: [{ agentId: 3 }], reported: "agent-ravi" })).toEqual(emptyPiles);
  });
});
