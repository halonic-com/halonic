import { join } from "node:path";
import type { HarnessTask, SandboxCommand } from "@halonicjs/ports";
import { claudeProgram } from "./detect.ts";
import { mcpSettingsFile, permissionPromptTool } from "./settings.ts";

/** The file in the session's temp folder that holds the agent's instructions; Claude Code reads it with `--append-system-prompt-file`. */
export const instructionsFileName = "halonic-instructions.md";

/** The files {@link claudeCodeCommand} names. */
export interface ClaudeCodeFiles {
  /** The agent's settings folder, which all its runs share. */
  settingsFolder: string;
  /** The file that holds this run's instructions, or `null` when the agent's file sets none. */
  instructionsFile: string | null;
}

/** Whether the agent's file sets instructions, so the run writes them to {@link instructionsFileName}. */
export function hasInstructions(task: HarnessTask): boolean {
  return task.instructions.trim() !== "";
}

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
 * - `--model` from the agent's file, when it sets one.
 * - `--append-system-prompt-file` with the agent's instructions, when its
 *   file sets them.
 *
 * Neither the prompt nor the instructions go in the arguments: a process's
 * arguments are visible to every program on the computer, and Windows caps
 * a whole command line at 32,767 characters, which a long agent file would
 * pass. The prompt goes on standard input, the instructions in a file.
 */
export function claudeCodeCommand(task: HarnessTask, files: ClaudeCodeFiles): SandboxCommand {
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    join(files.settingsFolder, mcpSettingsFile),
    "--strict-mcp-config",
    "--permission-prompt-tool",
    permissionPromptTool,
  ];
  if (task.model !== undefined) args.push("--model", task.model);
  if (files.instructionsFile !== null)
    args.push("--append-system-prompt-file", files.instructionsFile);
  return { program: claudeProgram, args };
}

/**
 * One message for Claude Code's standard input, as a `stream-json` line: the
 * task's prompt first, then each answer a person sends.
 */
export function userMessageLine(text: string): string {
  return `${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`;
}
