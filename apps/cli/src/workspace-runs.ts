// A workspace's runs, as the CLI opens them. They live in the person's
// profile folder, never in the workspace (HAL-2022 G4), in the folder
// `workspaceFolders` names after the workspace's real path. The Studio
// finds the same folder from Rust, so a run started in one shows in the
// other. `halonic runs` reads this store, and `halonic run` will write it.

import { homedir } from "node:os";
import { FolderRunStore } from "@halonicjs/adapter-fs-node";
import { engineStateFolders } from "@halonicjs/adapter-workspace-engine-node";
import type { RunStore } from "@halonicjs/ports";
import type { ProfileEnvironment, ProfilePlatform } from "@halonicjs/profile";
import { checkProfileHome } from "./profile-home.ts";

/**
 * The profile's system name for a Node `process.platform`: `win32` is
 * Windows, `darwin` is macOS, and every other system is kept like Linux.
 */
export function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") {
    return "windows";
  }
  if (platform === "darwin") {
    return "macos";
  }
  return "linux";
}

/**
 * What `profileFolder` reads, from this process: its system, home folder and
 * environment.
 *
 * @throws KindedError `invalid_input` when `HALONIC_HOME` isn't an absolute
 *   folder (see {@link checkProfileHome})
 */
export function nodeProfileEnvironment(): ProfileEnvironment {
  return checkProfileHome({
    platform: profilePlatformOf(process.platform),
    homeFolder: homedir(),
    variables: process.env,
  });
}

// The CLI's commands take the digest from here, with the profile environment.
// It is the engine's own, so the folders they name are the ones the engine uses.
export { webCryptoDigest } from "@halonicjs/adapter-workspace-engine-node";

/**
 * The run store of the workspace in `workspaceRoot`: its own runs, not a
 * deployment's. Nothing is created until a run is written, and a workspace
 * with no runs yet lists none.
 *
 * Two spellings of one folder, such as a link to it, open the same store,
 * because the folder is named after the workspace's real path.
 *
 * @param workspaceRoot - the workspace folder, as `openWorkspaceDir` found it
 * @param environment - where the profile folder is; this process's by default
 * @throws when the workspace folder doesn't exist, or `HALONIC_HOME` or the
 *   home folder isn't an absolute folder
 *
 * @example
 * const runs = await openWorkspaceRuns(workspace.root);
 * await new RunHistory(runs).listRuns({ status: "failed" });
 */
export async function openWorkspaceRuns(
  workspaceRoot: string,
  environment: ProfileEnvironment = nodeProfileEnvironment(),
): Promise<RunStore> {
  const { folders } = await engineStateFolders(workspaceRoot, environment);
  return new FolderRunStore(folders.runsFolder());
}
