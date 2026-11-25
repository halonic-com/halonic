import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  countHeldUp,
  type OpenTask,
  rankWaiting,
  type WaitingTask,
  waitingDocument,
  waitingSince,
  waitReason,
} from "./waiting.ts";

const open = (overrides: Partial<OpenTask>): OpenTask => ({
  id: "task-1",
  identifier: "HAL-1",
  status: "blocked",
  assigneeAgentId: "agent-mateo",
  assigneeUserId: null,
  updatedAt: new Date("2026-11-22T10:00:00Z"),
  ...overrides,
});

const waiting = (identifier: string, blocks: number, since: string): WaitingTask => ({
  taskId: `task-${identifier}`,
  identifier,
  reason: "blocked",
  holderAgentId: "agent-mateo",
  blocks,
  blocksAtLeast: false,
  since,
});

/** Blocker links as a map: each task to the tasks it blocks. */
const links = (graph: Record<string, string[]>) => async (taskId: string) => graph[taskId] ?? [];

verifies("paperclip.board-check-waiting", () => {
  test.each([
    ["blocked, assigned to a board user", open({ assigneeUserId: "user-1" }), false, "blocked"],
    [
      "blocked, the board owns the unblock",
      open({ unblockDescriptor: { owner: { userId: "user-1" } } }),
      false,
      "blocked",
    ],
    [
      "blocked, an agent owns the unblock",
      open({ unblockDescriptor: { owner: { agentId: "agent-liam" } } }),
      false,
      undefined,
    ],
    ["blocked on another task", open({}), false, undefined],
    [
      "in review with a board card",
      open({
        status: "in_review",
        reviewAttention: { paths: [{ kind: "interaction", since: "2026-11-22T09:00:00Z" }] },
      }),
      false,
      "card",
    ],
    ["in review, card read separately", open({ status: "in_review" }), true, "card"],
    [
      "in review with an agent reviewer",
      open({ status: "in_review", reviewAttention: { paths: [] } }),
      false,
      undefined,
    ],
    ["in progress", open({ status: "in_progress", assigneeUserId: "user-1" }), true, undefined],
  ])("%s", (_name, task, pendingCard, reason) => {
    expect(waitReason(task, pendingCard)).toBe(reason);
  });

  test("waits since the block or the card when Paperclip says, else the last update", () => {
    expect(waitingSince(open({ blockedTransitionAt: "2026-11-22T08:00:00Z" }))).toBe(
      "2026-11-22T08:00:00.000Z",
    );
    const card = { paths: [{ kind: "interaction", since: "2026-11-22T09:00:00Z" }] };
    expect(waitingSince(open({ status: "in_review", reviewAttention: card }))).toBe(
      "2026-11-22T09:00:00.000Z",
    );
    expect(waitingSince(open({}))).toBe("2026-11-22T10:00:00.000Z");
  });

  test("counts tasks held up through the chain once each, through a loop too", async () => {
    const graph = links({ a: ["b", "c"], b: ["d"], c: ["d"], d: ["a"] });
    expect(await countHeldUp("a", graph, { reads: 100 })).toEqual({ blocks: 3, atLeast: false });
  });

  test("stops at the read budget and says the count is a floor", async () => {
    const graph = links({ a: ["b"], b: ["c"], c: ["d"] });
    const budget = { reads: 2 };
    expect(await countHeldUp("a", graph, budget)).toEqual({ blocks: 2, atLeast: true });
    expect(budget.reads).toBe(0);
  });

  test("ranks most held up first, longest waiting first on a tie", () => {
    const ranked = rankWaiting([
      waiting("HAL-1", 0, "2026-11-22T08:00:00.000Z"),
      waiting("HAL-2", 3, "2026-11-22T09:00:00.000Z"),
      waiting("HAL-3", 3, "2026-11-22T07:00:00.000Z"),
    ]);
    expect(ranked.map((task) => task.identifier)).toEqual(["HAL-3", "HAL-2", "HAL-1"]);
  });

  test("writes a ranked list with holders and counts, and a line when nothing waits", () => {
    const names = new Map([["agent-mateo", "Mateo"]]);
    const board = { ...waiting("HAL-2", 1, "2026-11-22T09:00:00.000Z"), holderAgentId: null };
    const document = waitingDocument(
      [{ ...waiting("HAL-3", 4, "2026-11-22T07:00:00.000Z"), blocksAtLeast: true }, board],
      names,
    );
    expect(document).toContain(
      "1. HAL-3: blocked on the board, holds up 4+ tasks, waiting since 22 Nov 08:00 CET, held by Mateo",
    );
    expect(document).toContain(
      "2. HAL-2: blocked on the board, holds up 1 task, waiting since 22 Nov 10:00 CET, held by the board",
    );
    expect(waitingDocument([], names)).toContain("Nothing waits on the board.");
  });
});
