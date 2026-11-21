import {
  type HarnessBridge,
  type HarnessTask,
  harnessBridgeTokenHeader,
  type SandboxProfile,
} from "@halonicjs/ports";

/**
 * The variable that carries the run token for the bridge's MCP server. The
 * MCP settings name it in the server's header, and Claude Code fills it in
 * from its environment, so the token is never written into a file.
 */
export const claudeCodeRunTokenVariable = "HALONIC_RUN_TOKEN";

/**
 * The variables that name the models Claude Code picks by itself: the ones
 * behind its `haiku`, `sonnet` and `opus` names, the small, fast one for
 * its background calls, and its subagents' one.
 */
const claudeCodeModelVariables = [
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
] as const;

/**
 * What Claude Code gets as its own key when its bridge serves a key Halonic
 * keeps (requirement `harness-claude-code.stand-in-key`). Without a key or a
 * sign-in, Claude Code says "Not logged in" and never calls its model. This
 * holds no secret: the bridge puts the real key in its place on each call.
 */
export const claudeCodeStandInKey = "halonic-bridge-stand-in";

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
 * - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`: `1`, so Claude Code sends no
 *   telemetry, error reports or update checks of its own. Those go straight
 *   to Anthropic, not through the bridge, so the sandbox's network fence
 *   blocks them and fills the run's log with refused connections (HAL-14992).
 * - `HALONIC_RUN_TOKEN`: the run token again, for the bridge's MCP server.
 *   `ANTHROPIC_CUSTOM_HEADERS` covers only model requests, so the MCP
 *   settings name this variable in the server's header, and the token is
 *   never written into a file.
 * - `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `…_SONNET_MODEL`, `…_OPUS_MODEL`,
 *   `ANTHROPIC_SMALL_FAST_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL`: the task's model, only when it is marked
 *   `modelForEveryCall` (requirement `harness-claude-code.model-variables`).
 *   A compatible provider has none of Claude's models, so Claude Code's
 *   background and subagent calls ask for the agent's model too.
 * - `ANTHROPIC_API_KEY`, only when the bridge serves Anthropic with a key
 *   Halonic keeps: {@link claudeCodeStandInKey}, so Claude Code calls its
 *   model. With the person's own sign-in it stays unset, or Claude Code would
 *   send the stand-in instead of the sign-in.
 *
 * The values hold the run token. The engine passes them only to the sandbox;
 * nothing here writes them anywhere else.
 *
 * @throws Error when the profile has no settings folder: Claude Code always needs one
 */
export function claudeCodeEnvironment(
  bridge: HarnessBridge,
  folders: ClaudeCodeFolders,
  model?: Pick<HarnessTask, "model" | "modelForEveryCall">,
): Record<string, string> {
  if (folders.settingsFolder === null) {
    throw new Error("Claude Code needs a settings folder, and the sandbox profile has none.");
  }
  return {
    ANTHROPIC_BASE_URL: bridge.url,
    ANTHROPIC_CUSTOM_HEADERS: `${harnessBridgeTokenHeader}: ${bridge.token}`,
    CLAUDE_CONFIG_DIR: folders.settingsFolder,
    CLAUDE_CODE_TMPDIR: folders.tempFolder,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    [claudeCodeRunTokenVariable]: bridge.token,
    ...modelVariables(model),
    ...(bridge.keyProviders?.includes("anthropic") === true
      ? { ANTHROPIC_API_KEY: claudeCodeStandInKey }
      : {}),
  };
}

/** Each of Claude Code's own model variables set to the task's model, or none when it isn't for every call. */
function modelVariables(
  model: Pick<HarnessTask, "model" | "modelForEveryCall"> | undefined,
): Record<string, string> {
  if (model?.model === undefined || model.modelForEveryCall !== true) return {};
  const chosen = model.model;
  return Object.fromEntries(claudeCodeModelVariables.map((name) => [name, chosen]));
}
