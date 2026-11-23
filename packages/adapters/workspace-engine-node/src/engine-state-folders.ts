// Where the state of one workspace's engine lives on this computer (D11 of
// the HAL-14206 design): its lock, runs, blobs, timers and program copies.
// Everything that opens or reads that state finds it here, so the CLI's
// commands, the agent host's engine role and the Studio's Rust side
// (`engine_lock.rs`, which reads the same folders) always agree. Moving the
// state to the app's own data folder (plan 8.2) is then a change to this
// file only. The folder is named after the workspace's real path, never
// after a file inside the workspace.

import { realpath } from "node:fs/promises";
import {
  type ProfileEnvironment,
  type ProfileFolder,
  profileFolder,
  type WorkspaceFolders,
  workspaceFolders,
} from "@halonicjs/profile";
import { webCryptoDigest } from "./web-crypto-digest.ts";

/** Where the engine's workspace is: its real path, and its folders in the profile. */
export interface EnginePlace {
  readonly location: string;
  readonly folders: WorkspaceFolders;
  /** The profile folder, where the approvals of listed tools and the trust records are kept. */
  readonly profile: ProfileFolder;
  /** Where the profile folder was found from. */
  readonly environment: ProfileEnvironment;
}

/**
 * The folders of the workspace in `workspaceRoot` on this computer. Two
 * spellings of one folder, such as a link to it, get the same folders,
 * because they are named after the workspace's real path. Nothing is created.
 *
 * @param workspaceRoot - the workspace folder, as `openWorkspaceDir` found it
 * @param environment - where the profile folder is
 * @throws when the workspace folder doesn't exist
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 *
 * @example
 * const { folders } = await engineStateFolders(workspace.root, environment);
 * new FolderRunStore(folders.runsFolder());
 */
export async function engineStateFolders(
  workspaceRoot: string,
  environment: ProfileEnvironment,
): Promise<EnginePlace> {
  return engineStateFoldersAt(await realpath(workspaceRoot), environment);
}

/**
 * {@link engineStateFolders} for a workspace whose real path is already
 * known, such as one `realpath` gave. Kept apart so a fixed path can be
 * checked against the folders the Rust side finds for it.
 */
export async function engineStateFoldersAt(
  location: string,
  environment: ProfileEnvironment,
): Promise<EnginePlace> {
  const profile = profileFolder(environment);
  const folders = await workspaceFolders(profile, location, webCryptoDigest);
  return { location, folders, profile, environment };
}
