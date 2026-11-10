import { join } from "node:path";
import type { HarnessTask, SandboxCommand } from "@halonicjs/ports";
import { claudeProgram } from "./detect.ts";
import { mcpSettingsFile, permissionPromptTool } from "./settings.ts";

/**
 * The command that runs Claude Code for one task (requirement
 * `harness-claude-code.command`):
 *
 * - `-p` with `stream-json` in and out: the prompt and later answers arrive
 *   on standard input, one JSON line each, and Claude Code reports what it
 *   does on standard output. `--verbose` is what makes `-p` print every
 *   message, not only the result.
 * - `--mcp-config` with `--strict-mcp-config`: the bridge's MCP server from
 *   the settings folder, and no other, so a project's own `.mcp.json` can't
 *   add servers past Halonic.
 * - `--permission-prompt-tool`: a tool call that needs an OK goes to the
 *   bridge, which asks the person through Halonic's approvals.
 * - `--model` and `--append-system-prompt` from the agent's file, when it
 *   sets them.
 *
 * The prompt itself goes on standard input, never in the arguments: a
 * process's arguments are visible to every program on the computer.
 */
export function claudeCodeCommand(task: HarnessTask, settingsFolder: string): SandboxCommand {
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    join(settingsFolder, mcpSettingsFile),
    "--strict-mcp-config",
    "--permission-prompt-tool",
    permissionPromptTool,
  ];
  if (task.model !== undefined) args.push("--model", task.model);
  if (task.instructions.trim() !== "") args.push("--append-system-prompt", task.instructions);
  return { program: claudeProgram, args };
}

/**
 * One message for Claude Code's standard input, as a `stream-json` line: the
 * task's prompt first, then each answer a person sends.
 */
export function userMessageLine(text: string): string {
  return `${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`;
}
