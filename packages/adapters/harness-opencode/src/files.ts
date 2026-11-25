import type { SandboxProfile } from "@halonicjs/ports";
import { pathBelow } from "@halonicjs/std";

/** The folders of the sandbox profile OpenCode's files go in. */
export type OpenCodeFolders = Pick<SandboxProfile, "tempFolder" | "settingsFolder">;

/**
 * Where OpenCode keeps everything, all inside folders the adapter owns
 * (requirement `harness-opencode.environment`). Nothing points at the
 * person's `~/.config/opencode` or `~/.local/share/opencode`.
 */
export interface OpenCodeFiles {
  /**
   * The home folder OpenCode gets (`HOME`). srt passes no `HOME` into the
   * fence, and without one OpenCode would look up the account's own home
   * folder for anything the other variables don't cover.
   */
  homeFolder: string;
  /** OpenCode's config folder (`OPENCODE_CONFIG_DIR` and `XDG_CONFIG_HOME`). */
  configFolder: string;
  /** The file in it that holds only the update policy (`opencodeUpdatePolicyText`). */
  updatePolicyFile: string;
  /** Its data, state and cache folders (`XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`), where its log goes. */
  dataFolder: string;
  stateFolder: string;
  cacheFolder: string;
  /** Its session database (`OPENCODE_DB`). */
  database: string;
  /** The model catalog the adapter writes (`OPENCODE_MODELS_PATH`), so models.dev is never fetched. */
  modelCatalog: string;
  /** The instructions file of this session, in its own temp folder. */
  instructionsFile: string;
}

/**
 * The files of one OpenCode session: the agent's settings folder holds what
 * its runs share, the session's temp folder what is this run's alone.
 * It imports no `node:path`, so the Studio page can call it too.
 *
 * @throws Error when the profile has no settings folder: OpenCode always needs one
 */
export function opencodeFiles(folders: OpenCodeFolders): OpenCodeFiles {
  const settings = folders.settingsFolder;
  if (settings === null) {
    throw new Error("OpenCode needs a settings folder, and the sandbox profile has none.");
  }
  return {
    homeFolder: pathBelow(settings, "home"),
    configFolder: pathBelow(settings, "config"),
    updatePolicyFile: pathBelow(settings, "config", "opencode.json"),
    dataFolder: pathBelow(settings, "data"),
    stateFolder: pathBelow(settings, "state"),
    cacheFolder: pathBelow(settings, "cache"),
    database: pathBelow(settings, "opencode.db"),
    modelCatalog: pathBelow(settings, "models.json"),
    instructionsFile: pathBelow(folders.tempFolder, "halonic-instructions.md"),
  };
}
