import type { HarnessBridge, SandboxProfile } from "@halonicjs/ports";

/** The folders of the sandbox profile the environment points Codex at. */
export type CodexFolders = Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder">;

/**
 * The variable that carries the run token. The `config.toml` the harness
 * writes names it in the bridge provider's `env_http_headers`, so Codex
 * reads the token from the environment and sends it in the bridge's own
 * header. The token is never written into a file.
 */
export const codexRunTokenVariable = "HALONIC_RUN_TOKEN";

/**
 * The environment variables Codex needs to run behind the bridge
 * (requirement `harness-codex.environment`):
 *
 * - `CODEX_HOME`: the agent's own settings folder, never the person's
 *   `~/.codex`. Its `config.toml` points Codex at the run's bridge.
 * - `HALONIC_RUN_TOKEN`: the run token, which Codex sends in the bridge's
 *   header. `Authorization` stays free for the person's own sign-in.
 *
 * The bridge's address isn't a variable: Codex reads a custom provider's
 * address only from its settings, so it goes on the command line
 * (`codexConfigArgs`), and the address holds no secret.
 *
 * The values hold the run token. The engine passes them only to the
 * sandbox; nothing here writes them anywhere else.
 *
 * @throws Error when the profile has no settings folder: Codex always needs one
 */
export function codexEnvironment(
  bridge: HarnessBridge,
  folders: CodexFolders,
): Record<string, string> {
  if (folders.settingsFolder === null) {
    throw new Error("Codex needs a settings folder, and the sandbox profile has none.");
  }
  return {
    CODEX_HOME: folders.settingsFolder,
    [codexRunTokenVariable]: bridge.token,
  };
}
