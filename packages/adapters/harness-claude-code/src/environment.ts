import {
  type HarnessBridge,
  harnessBridgeTokenHeader,
  type SandboxProfile,
} from "@halonicjs/ports";
import { claudeCodeRunTokenVariable } from "./settings.ts";

/** The folders of the sandbox profile the environment points Claude Code at. */
export type ClaudeCodeFolders = Pick<SandboxProfile, "tempFolder" | "settingsFolder">;

/**
 * The environment variables Claude Code needs to run behind the bridge
 * (requirement `harness-claude-code.environment`):
 *
 * - `ANTHROPIC_BASE_URL`: its model requests go to the run's bridge, never
 *   straight to Anthropic.
 * - `ANTHROPIC_CUSTOM_HEADERS`: one `name: value` line, so every request
 *   carries the run token in the bridge's own header. `Authorization` stays
 *   free for the person's own sign-in.
 * - `CLAUDE_CONFIG_DIR`: the agent's own settings folder, never the person's
 *   `~/.claude`.
 * - `CLAUDE_CODE_TMPDIR`: the session's own temp folder, fresh per session.
 *   Without it, sessions share one folder under the system temp folder
 *   (HAL-1710, check 3).
 * - `HALONIC_RUN_TOKEN`: the run token again, for the bridge's MCP server.
 *   `ANTHROPIC_CUSTOM_HEADERS` covers only model requests, so the MCP
 *   settings name this variable in the server's header, and the token is
 *   never written into a file.
 *
 * The values hold the run token. The engine passes them only to the sandbox;
 * nothing here writes them anywhere else.
 *
 * @throws Error when the profile has no settings folder: Claude Code always needs one
 */
export function claudeCodeEnvironment(
  bridge: HarnessBridge,
  folders: ClaudeCodeFolders,
): Record<string, string> {
  if (folders.settingsFolder === null) {
    throw new Error("Claude Code needs a settings folder, and the sandbox profile has none.");
  }
  return {
    ANTHROPIC_BASE_URL: bridge.url,
    ANTHROPIC_CUSTOM_HEADERS: `${harnessBridgeTokenHeader}: ${bridge.token}`,
    CLAUDE_CONFIG_DIR: folders.settingsFolder,
    CLAUDE_CODE_TMPDIR: folders.tempFolder,
    [claudeCodeRunTokenVariable]: bridge.token,
  };
}
