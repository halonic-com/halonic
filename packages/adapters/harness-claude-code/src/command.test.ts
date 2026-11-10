import { join } from "node:path";
import type { HarnessTask } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeCodeCommand, userMessageLine } from "./command.ts";

const settingsFolder = join("agents", "writer", "settings");

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "Name a colour of the sea.",
  model: "claude-sonnet-5-5",
};

verifies("harness-claude-code.command", () => {
  describe("claudeCodeCommand", () => {
    it("runs claude in stream-json mode with only the bridge's MCP server and its permission tool", () => {
      expect(claudeCodeCommand(task, settingsFolder)).toEqual({
        program: "claude",
        args: [
          "-p",
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
          "--verbose",
          "--mcp-config",
          join(settingsFolder, "halonic-mcp.json"),
          "--strict-mcp-config",
          "--permission-prompt-tool",
          "mcp__halonic__approve_permission",
          "--model",
          "claude-sonnet-5-5",
          "--append-system-prompt",
          "Answer in one short sentence.",
        ],
      });
    });

    it("keeps the prompt out of the arguments", () => {
      expect(claudeCodeCommand(task, settingsFolder).args.join(" ")).not.toContain(task.prompt);
    });

    it("leaves out the model and the instructions when the agent's file sets none", () => {
      const { model: _model, ...withoutModel } = task;
      const { args } = claudeCodeCommand({ ...withoutModel, instructions: " \n" }, settingsFolder);

      expect(args).not.toContain("--model");
      expect(args).not.toContain("--append-system-prompt");
    });
  });

  describe("userMessageLine", () => {
    it("is one stream-json user message, ending with a line break", () => {
      const line = userMessageLine("Name a colour\nof the sea.");

      expect(line.endsWith("\n")).toBe(true);
      expect(line.slice(0, -1)).not.toContain("\n");
      expect(JSON.parse(line)).toEqual({
        type: "user",
        message: { role: "user", content: "Name a colour\nof the sea." },
      });
    });
  });
});
