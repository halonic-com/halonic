import { secretRemoved } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  bridgeToken,
  done,
  item,
  readAll,
  readRecorded,
  threadId,
  turnCompleted,
} from "./app-server-events.test-helper.ts";
import type { AppServerNotification } from "./app-server-events.ts";

verifies("harness-codex.subagents", () => {
  const shell = (agent: string, command: string) => ({
    type: "tool.called",
    agent,
    tool: "shell",
    args: { command: `/bin/bash -lc '${command}'`, cwd: "/workspace" },
  });
  const result = (agent: string, text: string) => ({
    type: "tool.result",
    agent,
    tool: "shell",
    result: text,
    outcome: "ok",
  });
  const started = (agent: string, prompt: string) => ({
    type: "agent.started",
    agent,
    prompt,
    parent: "writer",
  });
  const finished = (agent: string, output: string) => ({
    type: "agent.finished",
    agent,
    output,
    parent: "writer",
  });

  describe("a recorded run of Codex 0.166.0", () => {
    it("reports two subagents under the task agent, each with its own name and tool calls", () => {
      const { events, error } = readRecorded("codex-0.166.0-subagents.jsonl");
      expect(error).toBeUndefined();
      expect(events).toEqual([
        started("subagent", "List the notes folder."),
        started("subagent-2", "Count the lines of notes/a.md."),
        shell("subagent", "ls notes"),
        shell("subagent-2", "wc -l notes/a.md"),
        result("subagent-2", "2 notes/a.md\n"),
        result("subagent", "a.md\nb.md\n"),
        finished("subagent-2", "notes/a.md has 2 lines."),
        finished("subagent", "notes has a.md and b.md."),
        {
          type: "agent.finished",
          agent: "writer",
          output: "The notes folder has a.md and b.md; a.md has 2 lines.",
        },
      ]);
    });

    it("starts a subagent again for the task it is sent after it finished", () => {
      const { events, error } = readRecorded("codex-0.166.0-followup.jsonl");
      expect(error).toBeUndefined();
      expect(events).toEqual([
        started("subagent", "List the notes folder."),
        shell("subagent", "ls notes"),
        result("subagent", "a.md\nb.md\n"),
        finished("subagent", "notes has a.md and b.md."),
        started("subagent", "Count the lines of notes/b.md."),
        shell("subagent", "wc -l notes/b.md"),
        result("subagent", "1 notes/b.md\n"),
        finished("subagent", "notes/b.md has 1 line."),
        {
          type: "agent.finished",
          agent: "writer",
          output: "notes has a.md and b.md; b.md has 1 line.",
        },
      ]);
    });
  });

  describe("AppServerEventReader", () => {
    const spawn = {
      type: "collabAgentToolCall",
      id: "spawn-1",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: threadId,
      receiverThreadIds: ["thread-helper"],
      prompt: "Read the notes.",
    };
    const helperTurnCompleted = (turn: Record<string, unknown>): AppServerNotification => ({
      method: "turn/completed",
      params: { threadId: "thread-helper", turn: { id: "turn-2", ...turn } },
    });

    it("finishes a subagent whose turn failed with what went wrong, once, and the run goes on", () => {
      const { events, error } = readAll([
        item("item/completed", spawn),
        helperTurnCompleted({ status: "failed", error: { message: `no space; ${bridgeToken}` } }),
        helperTurnCompleted({ status: "completed" }),
        done,
      ]);
      expect(error).toBeUndefined();
      expect(events).toEqual([
        started("subagent", "Read the notes."),
        finished("subagent", `Codex stopped with an error: no space; ${secretRemoved}`),
        { type: "agent.finished", agent: "writer", output: "" },
      ]);
    });

    it("gives a subagent's subagent the subagent as parent", () => {
      const nested = {
        ...spawn,
        id: "spawn-2",
        senderThreadId: "thread-helper",
        receiverThreadIds: ["thread-nested"],
        prompt: "Read monday.md.",
      };
      const { events } = readAll([
        item("item/completed", spawn),
        { method: "item/completed", params: { threadId: "thread-helper", item: nested } },
      ]);
      expect(events).toEqual([
        started("subagent", "Read the notes."),
        { ...started("subagent-2", "Read monday.md."), parent: "subagent" },
      ]);
    });

    it("finishes the subagents still working when the task agent finishes, newest first", () => {
      const nested = {
        ...spawn,
        id: "spawn-2",
        senderThreadId: "thread-helper",
        receiverThreadIds: ["thread-nested"],
        prompt: "Read monday.md.",
      };
      const unfinished = "The task agent finished before this subagent did.";
      const { events, error } = readAll([
        item("item/completed", spawn),
        { method: "item/completed", params: { threadId: "thread-helper", item: nested } },
        done,
      ]);
      expect(error).toBeUndefined();
      expect(events).toEqual([
        started("subagent", "Read the notes."),
        { ...started("subagent-2", "Read monday.md."), parent: "subagent" },
        { ...finished("subagent-2", unfinished), parent: "subagent" },
        finished("subagent", unfinished),
        { type: "agent.finished", agent: "writer", output: "" },
      ]);
    });

    it("finishes the subagents still working, newest first, when the task agent's turn fails", () => {
      const nested = {
        ...spawn,
        id: "spawn-2",
        senderThreadId: "thread-helper",
        receiverThreadIds: ["thread-nested"],
        prompt: "Read monday.md.",
      };
      const unfinished = "The task agent finished before this subagent did.";
      const { events, error } = readAll([
        item("item/completed", spawn),
        { method: "item/completed", params: { threadId: "thread-helper", item: nested } },
        turnCompleted({ status: "failed", error: { message: "Quota exceeded" } }),
      ]);
      expect(String(error)).toContain("Codex stopped with an error: Quota exceeded");
      expect(events).toEqual([
        started("subagent", "Read the notes."),
        { ...started("subagent-2", "Read monday.md."), parent: "subagent" },
        { ...finished("subagent-2", unfinished), parent: "subagent" },
        finished("subagent", unfinished),
      ]);
    });

    it("doesn't start a subagent with a task it was sent while it was still working", () => {
      const followup = {
        ...spawn,
        id: "send-1",
        tool: "sendInput",
        status: "inProgress",
        prompt: "Read tuesday.md too.",
      };
      const { events } = readAll([
        item("item/completed", spawn),
        item("item/started", followup),
        helperTurnCompleted({ status: "completed" }),
        { method: "turn/started", params: { threadId: "thread-helper", turn: { id: "turn-3" } } },
      ]);
      expect(events).toEqual([
        started("subagent", "Read the notes."),
        finished("subagent", ""),
        started("subagent", ""),
      ]);
    });

    it("skips a spawn that started no thread, and Codex's other subagent calls", () => {
      const { events } = readAll([
        item("item/started", { ...spawn, status: "inProgress", receiverThreadIds: [] }),
        item("item/completed", { ...spawn, status: "failed", receiverThreadIds: [] }),
        item("item/completed", { ...spawn, tool: "wait", receiverThreadIds: ["thread-helper"] }),
        helperTurnCompleted({ status: "completed" }),
      ]);
      expect(events).toEqual([]);
    });
  });
});
