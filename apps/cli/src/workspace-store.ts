// A workspace's files as the CLI opens them: never the profile, even when
// the workspace holds it (HAL-15201). With the home folder as the workspace,
// the default profile is inside it, and a run's proposal could otherwise add
// `<profile>/unfenced-runs/…` and Accept would write it there. Studio's file
// calls fence the profile the same way (HAL-7039).

import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type ProfileEnvironment, type ProfileFolder, profileFolder } from "@halonicjs/profile";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/**
 * The files of the workspace in `root`, with the profile fenced off.
 *
 * @param root - the workspace folder
 * @param location - shown to people as where the files live; the root by default
 * @param profile - the profile folder, or where to find it; this process's by default
 *
 * @example
 * const store = workspaceStore(dir.root, dir.shown);
 * await store.write(".local/share/halonic/trust/x.json", "{}"); // throws RangeError
 */
export function workspaceStore(
  root: string,
  location?: string,
  profile: ProfileFolder | ProfileEnvironment = nodeProfileEnvironment(),
): FolderDefinitionStore {
  const fence = profileRootOf(profile);
  return new FolderDefinitionStore(root, location, fence === undefined ? {} : { fence });
}

/**
 * The profile folder's root, or `undefined` when no profile can be found:
 * then a relative `HALONIC_HOME` or home folder stops every command that
 * uses the profile, so nothing is written there to fence off, and a command
 * that only reads the workspace still works.
 */
function profileRootOf(profile: ProfileFolder | ProfileEnvironment): string | undefined {
  if ("root" in profile) return profile.root;
  try {
    return profileFolder(profile).root;
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}
