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

verifies("harness-codex.app-server-events", () => {
  describe("a recorded run of Codex 0.166.0", () => {
    it("reports commands and file changes, without the bridge token, and finishes once", () => {
      const { events, error } = readRecorded("codex-0.166.0-tools.jsonl");
      expect(error).toBeUndefined();
      const shell = (command: string) => ({
        type: "tool.called",
        agent: "writer",
        tool: "shell",
        args: { command: `/bin/bash -c '${command}'`, cwd: "/workspace" },
      });
      const result = (tool: string, text: string, outcome = "ok") => ({
        type: "tool.result",
        agent: "writer",
        tool,
        result: text,
        outcome,
      });
      expect(events).toEqual([
        shell("ls notes"),
        result("shell", "monday.md\ntuesday.md\n"),
        shell("cat notes/friday.md"),
        result("shell", "cat: notes/friday.md: No such file or directory\n", "error"),
        shell("env | grep HALONIC_RUN"),
        result("shell", `HALONIC_RUN_TOKEN=${secretRemoved}\n`),
        {
          type: "tool.called",
          agent: "writer",
          tool: "apply_patch",
          args: {
            changes: [
              {
                path: "/workspace/notes/summary.md",
                kind: "add",
                diff: "Two notes: monday and tuesday.\n",
              },
            ],
          },
        },
        result("apply_patch", "add /workspace/notes/summary.md"),
        { type: "agent.finished", agent: "writer", output: "I wrote notes/summary.md." },
      ]);
      expect(JSON.stringify(events)).not.toContain(bridgeToken);
    });

    it("reports an MCP tool, and leaves a call to the bridge's tools to the bridge", () => {
      const { events, error } = readRecorded("codex-0.166.0-mcp.jsonl");
      expect(error).toBeUndefined();
      expect(events).toEqual([
        {
          type: "tool.called",
          agent: "writer",
          tool: "mcp__notes__search_notes",
          args: { text: "monday" },
        },
        {
          type: "tool.result",
          agent: "writer",
          tool: "mcp__notes__search_notes",
          result: "monday.md: hi",
          outcome: "ok",
        },
        {
          type: "agent.finished",
          agent: "writer",
          output: "I searched the notes and sent the email.",
        },
      ]);
    });

    it("ends a turn the provider refused with an error that doesn't repeat the provider's answer", () => {
      const { events, error } = readRecorded("codex-0.166.0-failed.jsonl");
      expect(events).toEqual([]);
      expect(String(error)).toContain("the model provider refused the key or sign-in (401)");
      expect(String(error)).not.toContain("made-up-key");
    });
  });

  describe("AppServerEventReader", () => {
    it("reports an item Codex only reports as completed as both called and result", () => {
      const view = { type: "imageView", id: "view-1", path: "/workspace/chart.png" };
      const { events } = readAll([item("item/completed", view)]);
      expect(events).toEqual([
        { type: "tool.called", agent: "writer", tool: "view_image", args: { path: view.path } },
        { type: "tool.result", agent: "writer", tool: "view_image", result: "", outcome: "ok" },
      ]);
    });

    it("gives an MCP error's message as the result of a failed call", () => {
      const call = { type: "mcpToolCall", id: "c", server: "notes", tool: "search", arguments: {} };
      const failed = { ...call, status: "failed", result: null, error: { message: "timed out" } };
      const { events } = readAll([item("item/started", call), item("item/completed", failed)]);
      expect(events[1]).toMatchObject({ result: "timed out", outcome: "error" });
    });

    it("skips other threads, unknown notifications and items it can't read", () => {
      const command = { type: "commandExecution", id: "c", command: "ls", cwd: "/" };
      const { events } = readAll([
        { method: "item/started", params: { threadId: "another", item: command } },
        { method: "thread/tokenUsage/updated", params: { threadId } },
        { method: "item/started", params: null },
        item("item/started", { type: "commandExecution" }),
        item("item/started", { type: "reasoning", id: "r", summary: [] }),
        { ...done, params: { threadId: "another", turn: { status: "completed" } } },
      ]);
      expect(events).toEqual([]);
    });

    it("reports nothing after the final agent.finished", () => {
      const message = { type: "agentMessage", id: "m", text: "Done." };
      const command = { type: "commandExecution", id: "c", command: "ls", cwd: "/" };
      const { events } = readAll([
        item("item/completed", message),
        done,
        item("item/started", command),
        done,
      ]);
      expect(events).toEqual([{ type: "agent.finished", agent: "writer", output: "Done." }]);
    });

    it.each([
      [{ status: "interrupted", error: null }, "its turn was interrupted"],
      [
        { status: "failed", error: { message: `context full; ${bridgeToken}` } },
        "error: context full; [secret",
      ],
      [{ status: "failed", error: { codexErrorInfo: "unauthorized", message: "no" } }, "(401)"],
      [{ status: "failed", error: null }, "Codex stopped with an error."],
    ])("ends a turn that didn't complete with an error without the token", (turn, sentence) => {
      const { events, error } = readAll([turnCompleted(turn)]);
      expect(events).toEqual([]);
      expect(String(error)).toContain(sentence);
      expect(String(error)).not.toContain(bridgeToken);
    });
  });
});
