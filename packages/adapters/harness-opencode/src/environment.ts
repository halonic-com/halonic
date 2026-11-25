import type { HarnessBridge, HarnessTask, SandboxProfile } from "@halonicjs/ports";
import { opencodeConfig, opencodeRunTokenVariable } from "./config.ts";
import { type OpenCodeFiles, opencodeFiles } from "./files.ts";

/**
 * What OpenCode gets as its Anthropic key when the bridge serves Anthropic
 * with a key Halonic keeps. It holds no secret: the bridge puts the real key
 * in its place on each call.
 */
export const opencodeStandInKey = "halonic-bridge-stand-in";

/**
 * Every `OPENCODE_DISABLE_*` switch OpenCode 2.3.0 ships, each set to `1`.
 * Most of them turn off something that reaches the network or reads
 * instructions nobody pinned: the models fetch, auto-updates, the working
 * folder's config, `AGENTS.md` and `CLAUDE.md`, and Claude Code's skills.
 * A version bump re-lists them (the version-bump checklist).
 */
export const disableSwitches: readonly string[] = [
  "OPENCODE_DISABLE_AUTOUPDATE",
  "OPENCODE_DISABLE_CHANNEL_DB",
  "OPENCODE_DISABLE_CLAUDE_CODE",
  "OPENCODE_DISABLE_CLAUDE_CODE_SKILLS",
  "OPENCODE_DISABLE_FFF",
  "OPENCODE_DISABLE_FILEWATCHER",
  "OPENCODE_DISABLE_FREE_MODELS",
  "OPENCODE_DISABLE_MODELS_FETCH",
  "OPENCODE_DISABLE_PROJECT_CONFIG",
];

/**
 * The environment OpenCode runs with behind the bridge (requirement
 * `harness-opencode.environment`):
 *
 * - Each of {@link disableSwitches}.
 * - `OPENCODE_CONFIG_CONTENT`: the run's config ({@link opencodeConfig}),
 *   which names the token's variable but holds no token.
 * - `HOME`, `OPENCODE_CONFIG_DIR`, the `XDG_*` folders and `OPENCODE_DB`:
 *   folders the adapter owns, never the person's.
 * - `OPENCODE_MODELS_PATH`: the catalog the adapter writes.
 * - `HALONIC_RUN_TOKEN`: the run token, which OpenCode sends in the
 *   bridge's header. Its shell tool inherits it, as Claude Code's does
 *   (written in the threat model).
 * - `ANTHROPIC_API_KEY`, only when the bridge keeps Anthropic's key:
 *   {@link opencodeStandInKey}.
 *
 * The values hold the run token. The engine passes them only to the
 * sandbox; nothing here writes them anywhere else.
 */
export function opencodeEnvironment(
  bridge: HarnessBridge,
  task: Pick<HarnessTask, "model" | "maxOutputTokens">,
  files: OpenCodeFiles,
): Record<string, string> {
  const switches = Object.fromEntries(disableSwitches.map((name) => [name, "1"]));
  return {
    ...switches,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(opencodeConfig(bridge, task, files)),
    HOME: files.homeFolder,
    OPENCODE_CONFIG_DIR: files.configFolder,
    XDG_CONFIG_HOME: files.configFolder,
    XDG_DATA_HOME: files.dataFolder,
    XDG_STATE_HOME: files.stateFolder,
    XDG_CACHE_HOME: files.cacheFolder,
    OPENCODE_DB: files.database,
    OPENCODE_MODELS_PATH: files.modelCatalog,
    [opencodeRunTokenVariable]: bridge.token,
    ...(bridge.keyProviders?.includes("anthropic") === true
      ? { ANTHROPIC_API_KEY: opencodeStandInKey }
      : {}),
  };
}

/**
 * The harness's `environment` for an agent with this run's folders: the
 * environment of {@link opencodeEnvironment} with the files of
 * {@link opencodeFiles}. It imports nothing from Node, so the Studio page
 * gives it to the agent host's OpenCode stand-in (`harnessEnvironments`).
 *
 * @throws Error when the profile has no settings folder: OpenCode always needs one
 */
export function opencodeHarnessEnvironment(
  bridge: HarnessBridge,
  folders: Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder">,
  model?: Pick<HarnessTask, "model">,
): Record<string, string> {
  return opencodeEnvironment(bridge, model ?? {}, opencodeFiles(folders));
}
