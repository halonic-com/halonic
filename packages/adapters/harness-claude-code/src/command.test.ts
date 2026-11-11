import { join } from "node:path";
import type { HarnessTask } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeCodeCommand, hasInstructions, userMessageLine } from "./command.ts";

const files = {
  settingsFolder: join("agents", "writer", "settings"),
  instructionsFile: join("sessions", "one", "temp", "halonic-instructions.md"),
  ownSandbox: false,
};

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
      expect(claudeCodeCommand(task, files)).toEqual({
        program: "claude",
        args: [
          "-p",
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
          "--verbose",
          "--mcp-config",
          join(files.settingsFolder, "halonic-mcp.json"),
          "--strict-mcp-config",
          "--setting-sources",
          "user",
          "--permission-prompt-tool",
          "mcp__halonic-approvals__approve_permission",
          "--model",
          "claude-sonnet-5-5",
          "--append-system-prompt-file",
          files.instructionsFile,
        ],
      });
    });

    it("adds Claude Code's own sandbox settings next to the agent's own when the sandbox is on", () => {
      const { args } = claudeCodeCommand(task, { ...files, ownSandbox: true });
      const settings = args.indexOf("--settings");

      expect(args.slice(settings, settings + 2)).toEqual([
        "--settings",
        join(files.settingsFolder, "halonic-unfenced.json"),
      ]);
      expect(
        args.slice(args.indexOf("--setting-sources"), args.indexOf("--setting-sources") + 2),
      ).toEqual(["--setting-sources", "user"]);
      expect(claudeCodeCommand(task, files).args).not.toContain("--settings");
    });

    it("keeps the prompt and the instructions out of the arguments", () => {
      const commandLine = claudeCodeCommand(task, files).args.join(" ");

      expect(commandLine).not.toContain(task.prompt);
      expect(commandLine).not.toContain(task.instructions);
    });

    it("leaves out the model and the instructions file when there are none", () => {
      const { model: _model, ...withoutModel } = task;
      const { args } = claudeCodeCommand(withoutModel, { ...files, instructionsFile: null });

      expect(args).not.toContain("--model");
      expect(args).not.toContain("--append-system-prompt-file");
    });
  });

  describe("hasInstructions", () => {
    it("is false for instructions that are only blank space", () => {
      expect(hasInstructions(task)).toBe(true);
      expect(hasInstructions({ ...task, instructions: " \n" })).toBe(false);
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
