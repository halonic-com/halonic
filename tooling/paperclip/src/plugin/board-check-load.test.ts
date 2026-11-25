import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkerTask, type FakeTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { manifest } from "./manifest.ts";

const at = (time: string) => new Date(`2026-11-22T${time}:00Z`);
const settings = {
  boardCheckerTask: checkerTask.id,
  chiefTask: "task-chief",
  boardCheckWritesForVersion: manifest.version,
};

const task = (number: number, assigneeAgentId: string, status: string): FakeTask => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status,
  assigneeAgentId,
  updatedAt: at("10:00"),
});

const comments = (sent: { call: string; args: unknown[] }[], taskId: string) =>
  sent
    .filter((write) => write.call === "createComment" && write.args[0] === taskId)
    .map((write) => String(write.args[1]));

verifies("paperclip.board-check-load", () => {
  test("comments the team load on Chief's task once, and again only when it changes", async () => {
    // The fake team: the Board Checker and Mateo have work; the Merger and Priya have nothing to start.
    const tasks = [checkerTask, task(2, "agent-mateo", "todo")];
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => settings });
    const board = boardCheck(fake.ctx);
    await board.run(at("14:00"));
    await board.run(at("15:00"));
    expect(comments(fake.sent, "task-chief")).toEqual([
      [
        "Team load changed (Pip left out):",
        "- Nothing to start (no todo, no unblocked in progress): Merger, Priya.",
        "- More than 10 tasks in progress: nobody.",
        "",
        "Board check (plugin)",
      ].join("\n"),
    ]);
    tasks.push(task(3, "agent-priya", "todo"));
    await board.run(at("16:00"));
    expect(comments(fake.sent, "task-chief")[1]).toContain(
      "- Nothing to start (no todo, no unblocked in progress): Merger.",
    );
  });

  test("comments the team load on the first hour after the board turns writes on, with the same team", async () => {
    let config: Record<string, unknown> = { ...settings, boardCheckWritesForVersion: undefined };
    const tasks = [checkerTask, task(2, "agent-mateo", "todo")];
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => config });
    const board = boardCheck(fake.ctx);
    await board.run(at("14:00"));
    expect(comments(fake.sent, "task-chief")).toEqual([]);
    config = settings;
    await board.run(at("15:00"));
    await board.run(at("16:00"));
    expect(comments(fake.sent, "task-chief")).toHaveLength(1);
  });
});

verifies("paperclip.board-check-approvals", () => {
  test("comments new pending approvals once on the Board Checker's task, never on the first pass", async () => {
    const first = {
      id: "approval-1",
      type: "hire_agent",
      requestedByAgentId: "agent-mateo",
      createdAt: at("13:10"),
      payload: { note: "Payload the board check never repeats." },
    };
    const pending = [first];
    const fake = fakeBoardContext({
      tasks: [checkerTask],
      comments: {},
      config: () => settings,
      approvals: () => pending,
    });
    const board = boardCheck(fake.ctx);
    await board.run(at("14:20"));
    pending.push({ ...first, id: "approval-2", createdAt: at("14:25") });
    await board.run(at("14:30"));
    await board.run(at("14:40"));
    expect(comments(fake.sent, checkerTask.id)).toEqual([
      [
        "New pending approvals: 1. Listed only; the board decides them.",
        "- approval-2: hire_agent, asked by Mateo at 22 Nov 15:25 CET",
        "",
        "Board check (plugin)",
      ].join("\n"),
    ]);
    expect(JSON.stringify(fake.sent)).not.toContain("Payload");
  });

  test("lists an approval that became pending while writes were off once the board turns them on", async () => {
    let config: Record<string, unknown> = { ...settings, boardCheckWritesForVersion: undefined };
    const first = {
      id: "approval-1",
      type: "hire_agent",
      requestedByAgentId: "agent-mateo",
      createdAt: at("13:10"),
    };
    const pending = [first];
    const fake = fakeBoardContext({
      tasks: [checkerTask],
      comments: {},
      config: () => config,
      approvals: () => pending,
    });
    const board = boardCheck(fake.ctx);
    await board.run(at("14:20"));
    pending.push({ ...first, id: "approval-2", createdAt: at("14:25") });
    await board.run(at("14:30"));
    expect(comments(fake.sent, checkerTask.id)).toEqual([]);
    config = settings;
    await board.run(at("14:40"));
    await board.run(at("14:50"));
    const listed = comments(fake.sent, checkerTask.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toContain("- approval-2: hire_agent, asked by Mateo");
  });
});
