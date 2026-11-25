import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  agents,
  checkerTask,
  type FakeTaskComment,
  fakeBoardContext,
} from "../plugin/board-check.test-helper.ts";
import { planAsks } from "../plugin/board-check-asks.ts";
import { type AskComment, type BoardAskAction, decide, type FoundAsk } from "./rules/board-ask.ts";

/**
 * Today's board-check ask fixtures (`plugin/board-check.test.ts`), replayed
 * through the `board-ask` rule (HAL-18196): for each, the rule finds the
 * same asks and plans the same wake as `planAsks`.
 */

const now = new Date("2026-11-22T14:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const defaults = { windowMinutes: 12, wake: true };

const ask = (id: string, overrides: Partial<FakeTaskComment> = {}): FakeTaskComment => ({
  id,
  authorType: "agent",
  authorAgentId: "agent-mateo",
  createdAt: minutesAgo(2),
  body: "This needs the board's yes on the card.",
  ...overrides,
});

/** Each fixture: the comments on one task, by its number. */
const fixtures: [string, number, FakeTaskComment[]][] = [
  ["one ask", 16003, [ask("comment-1")]],
  [
    "a card that is up",
    16004,
    [ask("comment-2", { authorAgentId: "agent-priya", body: "Card is up." })],
  ],
  ["two asks, newest last", 16003, [ask("late", { createdAt: minutesAgo(1) }), ask("early")]],
  [
    "the board, the plugin, the Board Checker, receipts, signed and old comments, no ask",
    16003,
    [
      ask("by-board", { authorType: "user", authorAgentId: null }),
      ask("by-plugin", { authorType: "system", authorAgentId: null }),
      ask("by-checker", { authorAgentId: "agent-checker" }),
      ask("receipt", { origin: "fast_response" }),
      ask("signed", { body: "Waiting on the board.\n\nBoard check (plugin)" }),
      ask("too-old", { createdAt: minutesAgo(13) }),
      ask("no-ask", { body: "CI is green." }),
    ],
  ],
  ["the Merger's request", 14388, [ask("merger-request", { authorAgentId: "agent-merger" })]],
  [
    "the Merger's ask on another task",
    16004,
    [ask("merger-ask", { authorAgentId: "agent-merger" })],
  ],
  ["an ask from the future", 16003, [ask("future", { createdAt: minutesAgo(-1) })]],
];

const task = (number: number) => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status: "in_progress",
  assigneeAgentId: number === 14388 ? null : "agent-mateo",
  updatedAt: minutesAgo(2),
});

/** The rule's input for the comments on one task. */
function ruleComments(number: number, comments: readonly FakeTaskComment[]): AskComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    taskId: `task-${number}`,
    identifier: `HAL-${number}`,
    authorAgentId: comment.authorType === "agent" ? comment.authorAgentId : null,
    createdAt: comment.createdAt.toISOString(),
    origin: comment.origin ?? null,
    body: comment.body,
  }));
}

/** Today's plan for one fixture, as the rule's actions. */
async function todayActions(
  number: number,
  comments: FakeTaskComment[],
): Promise<BoardAskAction[]> {
  const fake = fakeBoardContext({
    tasks: [checkerTask, task(number)],
    comments: { [`task-${number}`]: comments },
    config: () => ({}),
  });
  const plan = await planAsks(
    fake.ctx,
    "acme",
    { checkerTaskId: checkerTask.id, wakeTaskId: undefined },
    now,
    {
      only: `task-${number}`,
    },
  );
  await plan.save(new Set());
  const actions: BoardAskAction[] = [];
  for (const write of plan.writes) {
    if (write.kind === "document") {
      actions.push({
        kind: "list-asks",
        asks: (fake.state.get("asks") as FoundAsk[] | undefined) ?? [],
      });
    }
    if (write.kind === "wake") {
      actions.push({ kind: "wake", task: write.taskId, reason: "board_check_ask", key: write.key });
    }
  }
  return actions;
}

function input(number: number, comments: readonly FakeTaskComment[], settings = defaults) {
  return {
    now: now.toISOString(),
    settings,
    checkerTaskId: checkerTask.id,
    boardCheckerAgentId: checkerTask.assigneeAgentId,
    mergerAgentId: agents.find((agent) => agent.urlKey === "merger")?.id ?? null,
    seen: [],
    comments: ruleComments(number, comments),
  };
}

verifies("paperclip.signal-board-ask", () => {
  test.each(fixtures)("gives today's actions for %s", async (_, number, comments) => {
    const today = await todayActions(number, comments);
    expect(decide(JSON.parse(JSON.stringify(input(number, comments))))).toEqual(today);
  });

  test("between the fixtures, finds asks and wakes the Board Checker, and skips the rest", async () => {
    const kinds = await Promise.all(
      fixtures.map(async ([, number, comments]) => (await todayActions(number, comments)).length),
    );
    expect(kinds).toEqual([2, 2, 2, 0, 0, 2, 0]);
  });

  test("leaves out an ask it has seen, keeps the list without a wake, and takes a wider window", () => {
    const comments = [ask("comment-1"), ask("older", { createdAt: minutesAgo(30) })];
    expect(decide({ ...input(16003, comments), seen: ["comment-1"] })).toEqual([]);
    const quiet = decide(input(16003, comments, { windowMinutes: 12, wake: false }));
    expect(quiet.map((action) => action.kind)).toEqual(["list-asks"]);
    const wide = decide(input(16003, comments, { windowMinutes: 45, wake: true }));
    expect(wide[0]).toMatchObject({ asks: [{ commentId: "older" }, { commentId: "comment-1" }] });
    expect(wide[1]).toMatchObject({ key: "board-check ask older" });
  });

  test("never copies a comment's text into an action", () => {
    const leaky = [ask("comment-1", { body: "For the board: please read this private line." })];
    expect(JSON.stringify(decide(input(16003, leaky)))).not.toContain("private line");
  });
});
