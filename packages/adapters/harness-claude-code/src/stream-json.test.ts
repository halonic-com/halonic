import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HarnessEvent } from "@halonicjs/ports";
import { secretRemoved } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SignInError } from "./sign-in.ts";
import { StreamJsonReader } from "./stream-json.ts";

const bridgeToken = "made-up-run-token-0123456789";

function newReader(): StreamJsonReader {
  return new StreamJsonReader({ agentId: "writer", bridgeToken });
}

/** The lines of a recorded run in `fixtures/`. */
function recorded(name: string): string[] {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, "utf8").split("\n");
}

/** Every event the lines give, and the error the run ended with, if any. */
function readAll(lines: readonly string[]): { events: HarnessEvent[]; error?: unknown } {
  const reader = newReader();
  const events: HarnessEvent[] = [];
  try {
    for (const line of lines) events.push(...reader.read(line));
  } catch (error) {
    return { events, error };
  }
  return { events };
}

function resultLine(fields: Record<string, unknown>): string {
  return JSON.stringify({ type: "result", subtype: "success", is_error: false, ...fields });
}

function toolUse(id: string, name: string, input: unknown, parent: string | null = null): string {
  const message = { role: "assistant", content: [{ type: "tool_use", id, name, input }] };
  return JSON.stringify({ type: "assistant", message, parent_tool_use_id: parent });
}

function toolResult(id: string, content: unknown, parent: string | null = null): string {
  const message = { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] };
  return JSON.stringify({ type: "user", message, parent_tool_use_id: parent });
}

verifies("harness-claude-code.stream-json", () => {
  describe("a recorded run of Claude Code 2.1.321", () => {
    it("reports tool calls and subagents, skips the bridge and finishes once", () => {
      const { events, error } = readAll(recorded("claude-code-2.1.321.jsonl"));
      expect(error).toBeUndefined();
      expect(events).toEqual([
        {
          type: "tool.called",
          agent: "writer",
          tool: "Bash",
          args: { command: "ls notes", description: "List the notes" },
        },
        {
          type: "tool.result",
          agent: "writer",
          tool: "Bash",
          result: "monday.md\ntuesday.md",
          outcome: "ok",
        },
        {
          type: "agent.started",
          agent: "Explore",
          prompt: "Summarise monday.md in one line.",
          parent: "writer",
        },
        {
          type: "tool.called",
          agent: "Explore",
          tool: "Read",
          args: { file_path: "/workspace/notes/monday.md" },
        },
        {
          type: "tool.result",
          agent: "Explore",
          tool: "Read",
          result: "     1\tPlan the launch.",
          outcome: "ok",
        },
        {
          type: "agent.finished",
          agent: "Explore",
          output: "Monday: plan the launch.",
          parent: "writer",
        },
        { type: "agent.finished", agent: "writer", output: "I sent the summary to the team." },
      ]);
    });
  });

  describe("a recorded run of Claude Code 2.1.311", () => {
    it("names each subagent of a type apart and fails at the error result", () => {
      const { events, error } = readAll(recorded("claude-code-2.1.311.jsonl"));
      expect(events.map(({ type, agent }) => `${type} ${agent}`)).toEqual([
        "tool.called writer",
        "tool.result writer",
        "agent.started general-purpose",
        "agent.started general-purpose-2",
        "tool.called general-purpose-2",
        "tool.result general-purpose-2",
        "agent.finished general-purpose",
        "agent.finished general-purpose-2",
      ]);
      expect(events[1]).toMatchObject({ outcome: "error" });
      expect(error).toEqual(
        new Error("Claude Code stopped because it used all its turns before it finished."),
      );
    });
  });

  describe("the result line", () => {
    it("is the last event: the reader reports nothing after it", () => {
      const reader = newReader();
      expect(reader.read(resultLine({ result: "Done." }))).toEqual([
        { type: "agent.finished", agent: "writer", output: "Done." },
      ]);
      expect(reader.finished).toBe(true);
      expect(reader.read(toolUse("toolu_late", "Bash", {}))).toEqual([]);
      expect(reader.read("not json")).toEqual([]);
    });

    it.each([
      ["Login expired · Please run /login", "sign-in-expired"],
      ["Not logged in · Please run /login", "signed-out"],
    ])("ends the run with a SignInError when it says %j", (text, problem) => {
      for (const isError of [true, false]) {
        const { events, error } = readAll([resultLine({ is_error: isError, result: text })]);
        expect(events).toEqual([]);
        expect(error).toBeInstanceOf(SignInError);
        expect(error).toMatchObject({ problem });
      }
    });

    it.each([
      [{ subtype: "error_max_budget_usd", is_error: true }, "it reached its spending limit"],
      [{ subtype: "error_during_execution", is_error: true }, "Claude Code stopped with an error."],
      [{ is_error: true, result: "API Error: 529 Overloaded" }, "error: API Error: 529 Overloaded"],
    ])("ends the run with an error for %j", (fields, sentence) => {
      const { events, error } = readAll([resultLine(fields)]);
      expect(events).toEqual([]);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SignInError);
      expect((error as Error).message).toContain(sentence);
    });

    it("hides the bridge token in an error Claude Code printed", () => {
      const result = `API Error: 401 bad header ${bridgeToken}`;
      const { error } = readAll([resultLine({ is_error: true, result })]);
      expect((error as Error).message).toBe(
        `Claude Code stopped with an error: API Error: 401 bad header ${secretRemoved}`,
      );
    });

    it.each([
      "Not logged in users see the landing page first.",
      "Authentication required: I added a check to every route.",
      "Login expired sessions now redirect.\nRun /login to try it.",
    ])("finishes as usual when a successful answer begins like a sign-in message: %j", (text) => {
      expect(readAll([resultLine({ result: text })])).toEqual({
        events: [{ type: "agent.finished", agent: "writer", output: text }],
      });
    });

    it("hides the bridge token in the final output", () => {
      const { events } = readAll([resultLine({ result: `The header is ${bridgeToken}.` })]);
      expect(events).toEqual([
        { type: "agent.finished", agent: "writer", output: `The header is ${secretRemoved}.` },
      ]);
    });

    it("finishes with empty output when the result has no text", () => {
      expect(readAll([resultLine({})]).events).toEqual([
        { type: "agent.finished", agent: "writer", output: "" },
      ]);
    });
  });

  describe("a line that isn't stream-json", () => {
    it.each([
      `oops ${bridgeToken}`,
      `{"type": "assistant", "token": "${bridgeToken}"`,
      "42",
      '["result"]',
      '{"subtype": "success"}',
    ])("ends the run without quoting %j", (line) => {
      const { error } = readAll([line]);
      expect(error).toEqual(
        new Error("Claude Code printed a line that isn't stream-json, so Halonic stopped the run."),
      );
      expect(String(error)).not.toContain(bridgeToken);
    });

    it("ends the run with a SignInError when it is a sign-in message", () => {
      const { error } = readAll(["Login expired · Please run /login"]);
      expect(error).toEqual(new SignInError("sign-in-expired"));
    });

    it("skips empty lines and line types it doesn't know", () => {
      const lines = ["", "   ", '{"type":"stream_event","event":{}}', '{"type":"system"}'];
      expect(readAll(lines)).toEqual({ events: [] });
    });
  });

  describe("tool calls", () => {
    it("reports no call through the bridge, nor its result", () => {
      const lines = [
        toolUse("toolu_ok", "mcp__halonic-approvals__approve_permission", { tool: "Bash" }),
        toolResult("toolu_ok", "allow"),
      ];
      expect(readAll(lines).events).toEqual([]);
    });

    it("reports a call to another MCP server", () => {
      const { events } = readAll([toolUse("toolu_x", "mcp__other__lookup", { q: "a" })]);
      expect(events).toEqual([
        { type: "tool.called", agent: "writer", tool: "mcp__other__lookup", args: { q: "a" } },
      ]);
    });

    it("reports nothing for a result it has seen no call for", () => {
      expect(readAll([toolResult("toolu_unknown", "text")]).events).toEqual([]);
    });

    it("keeps only the text of a result made of parts", () => {
      const parts = [
        { type: "text", text: "first" },
        { type: "image", source: { type: "base64", data: "" } },
        { type: "text", text: "second" },
      ];
      const { events } = readAll([toolUse("toolu_r", "Read", {}), toolResult("toolu_r", parts)]);
      expect(events[1]).toMatchObject({ type: "tool.result", result: "first\nsecond" });
    });

    it("starts a subagent from the older Task tool, and nests one in another", () => {
      const lines = [
        toolUse("toolu_outer", "Task", { subagent_type: "Plan", prompt: "Plan it." }),
        toolUse("toolu_inner", "Agent", { prompt: "Look." }, "toolu_outer"),
        toolResult("toolu_inner", "Seen.", "toolu_outer"),
        toolResult("toolu_outer", "Planned."),
      ];
      expect(readAll(lines).events).toEqual([
        { type: "agent.started", agent: "Plan", prompt: "Plan it.", parent: "writer" },
        { type: "agent.started", agent: "general-purpose", prompt: "Look.", parent: "Plan" },
        { type: "agent.finished", agent: "general-purpose", output: "Seen.", parent: "Plan" },
        { type: "agent.finished", agent: "Plan", output: "Planned.", parent: "writer" },
      ]);
    });

    it("leaves out parts it can't read", () => {
      const message = {
        content: ["text", { type: "tool_use", name: "Bash" }, { type: "tool_result" }],
      };
      const lines = [
        JSON.stringify({ type: "assistant", message }),
        JSON.stringify({ type: "user", message: "hello" }),
        JSON.stringify({ type: "assistant" }),
      ];
      expect(readAll(lines)).toEqual({ events: [] });
    });

    it("hides the bridge token in a call's args and result, and in a subagent's prompt and output", () => {
      const header = `x-halonic-run: ${bridgeToken}`;
      const lines = [
        toolUse("toolu_env", "Bash", { command: "env", env: { ANTHROPIC_CUSTOM_HEADERS: header } }),
        toolResult("toolu_env", `HOME=/home\nANTHROPIC_CUSTOM_HEADERS=${header}`),
        toolUse("toolu_sub", "Agent", { subagent_type: "Explore", prompt: `Use ${bridgeToken}` }),
        toolResult("toolu_sub", [{ type: "text", text: `Found ${JSON.stringify(bridgeToken)}` }]),
      ];
      const { events } = readAll(lines);
      expect(JSON.stringify(events)).not.toContain(bridgeToken);
      const hidden = `x-halonic-run: ${secretRemoved}`;
      expect(events).toEqual([
        {
          type: "tool.called",
          agent: "writer",
          tool: "Bash",
          args: { command: "env", env: { ANTHROPIC_CUSTOM_HEADERS: hidden } },
        },
        {
          type: "tool.result",
          agent: "writer",
          tool: "Bash",
          result: `HOME=/home\nANTHROPIC_CUSTOM_HEADERS=${hidden}`,
          outcome: "ok",
        },
        {
          type: "agent.started",
          agent: "Explore",
          prompt: `Use ${secretRemoved}`,
          parent: "writer",
        },
        {
          type: "agent.finished",
          agent: "Explore",
          output: `Found "${secretRemoved}"`,
          parent: "writer",
        },
      ]);
    });

    it("gives a call without input empty args, and a subagent without a prompt an empty one", () => {
      const call = { type: "tool_use", id: "toolu_a", name: "Agent" };
      const line = JSON.stringify({ type: "assistant", message: { content: [call] } });
      expect(readAll([line]).events).toEqual([
        { type: "agent.started", agent: "general-purpose", prompt: "", parent: "writer" },
      ]);
    });
  });
});
