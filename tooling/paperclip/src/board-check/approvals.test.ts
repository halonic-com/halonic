import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type PendingApproval, planApprovals, readSeenApprovals } from "./approvals.ts";

const names = new Map([["agent-chief", "Chief"]]);
const approval = (id: string, minute: number, overrides: Partial<PendingApproval> = {}) => ({
  id,
  type: "hire_agent",
  requestedByAgentId: "agent-chief",
  createdAt: new Date(`2026-11-22T13:${minute}:00Z`),
  payload: { note: "Payload the board check never repeats." },
  ...overrides,
});

verifies("paperclip.board-check-approvals", () => {
  test("lists only approvals that weren't pending at the last pass, oldest first, without payload", () => {
    const plan = planApprovals(
      [
        approval("approval-3", 40),
        approval("approval-1", 10),
        approval("approval-2", 20, { requestedByAgentId: null }),
      ],
      ["approval-1"],
      names,
    );
    expect(plan.comment).toBe(
      [
        "New pending approvals: 2. Listed only; the board decides them.",
        "- approval-2: hire_agent, asked by a board user at 22 Nov 14:20 CET",
        "- approval-3: hire_agent, asked by Chief at 22 Nov 14:40 CET",
      ].join("\n"),
    );
    expect(plan.seen).toEqual(["approval-3", "approval-1", "approval-2"]);
  });

  test("the first pass only notes what is pending, and a decided approval leaves the record", () => {
    const first = planApprovals([approval("approval-1", 10)], undefined, names);
    expect(first).toEqual({ comment: undefined, seen: ["approval-1"] });
    expect(planApprovals([], ["approval-1"], names)).toEqual({ comment: undefined, seen: [] });
    expect(readSeenApprovals(null)).toBeUndefined();
    expect(readSeenApprovals(["approval-1", 7])).toEqual(["approval-1"]);
  });
});
