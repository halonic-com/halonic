// What Halonic keeps for one workspace lives in the profile folder, never in
// the workspace, so nothing of it can end up in the workspace's git
// repository (HAL-2022 G4). Each workspace gets one folder there, named
// from a hash of its real path. The name is internal: nothing outside this
// file builds or reads it.

import type { Digest } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import {
  isAbsolutePath,
  joinPath,
  type ProfilePlatform,
  withoutTrailingSeparators,
} from "./native-path.ts";
import type { ProfileFolder } from "./profile-folder.ts";

/** The folder in the profile that holds one folder per workspace. */
const workspacesFolderName = "workspaces";

/**
 * How many hex characters of the SHA-256 name a workspace's folder: 128
 * bits, so two workspaces never share a folder, while the path stays short
 * enough for Windows.
 */
const keyLength = 32;

/**
 * A deployment id, as `deployments.yaml` allows it: at most 64 characters,
 * which keeps the runs folder's path under Windows' 260-character limit.
 * The format's own test checks that both rules accept the same ids.
 * Agent and harness ids name folders too, so they follow the same rule.
 */
const folderIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** The folder in a workspace's folder that holds its agents' harness settings. */
const harnessSettingsFolderName = "harness-settings";

/** Names Windows keeps for devices; a folder can't have them. */
const windowsDeviceNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** The folders one workspace has in the profile. Nothing is created. */
export interface WorkspaceFolders {
  /** The workspace's own folder in the profile. */
  readonly folder: string;
  /**
   * The folder for the workspace's runs, which a folder run store is given:
   * `runs`, or `deployments/<id>/runs` for one deployment's runs.
   *
   * @param deploymentId - the deployment, as picked by the shared rule; none for the workspace's own runs
   * @throws RangeError when the id isn't a deployment id
   */
  runsFolder(deploymentId?: string): string;
  /** The folder for the blobs the workspace's runs refer to: kept definitions and large payloads. */
  blobsFolder(): string;
  /**
   * The folder for the workspace's records, which a file record store is
   * given: agent notes and collections. Records belong to the workspace, so
   * two workspaces never share them (HAL-3295). A person's connection data,
   * such as tokens, is kept elsewhere in the profile, not here.
   */
  recordsFolder(): string;
  /**
   * The folder for the assistant's changes to review: one record per file,
   * with the file's baseline (HAL-3277). They decide what Try it leaves out,
   * so they are kept here like trust, never in the workspace (HAL-3417).
   */
  reviewFolder(): string;
  /**
   * The folder an agent's harness keeps its own settings in, such as the
   * agent's own sign-in: `harness-settings/<agentId>/<harnessId>`. One
   * agent signs in once per workspace, for every deployment (HAL-5355), so
   * the deployment isn't part of it. The harness is, so a switch from one
   * harness to another never mixes their files (HAL-6169).
   *
   * @param agentId - the agent's id, from its file
   * @param harnessId - the harness's id, such as `claude-code`
   * @throws RangeError when either id can't name a folder safely
   */
  harnessSettingsFolder(agentId: string, harnessId: string): string;
}

/**
 * The folders a workspace has in the profile. The CLI and the Studio both
 * call this, so they read and write the same runs.
 *
 * Pass the workspace's real path: absolute, with every link resolved, as
 * the system's own `realpath` gives it. Two paths to one folder then give
 * one key. Before hashing, the path is put in one spelling: trailing
 * separators are dropped everywhere; on Windows `/` becomes `\`, the
 * verbatim prefix (`\\?\`, `\\?\UNC\`) is dropped and case is ignored; on
 * macOS case and Unicode form (NFC) are ignored, as its volumes do by default.
 *
 * @param profile - the profile folder, from `profileFolder`
 * @param workspaceRealPath - the workspace's real path
 * @param digest - the port that hashes; the core has no hash code of its own
 * @returns the workspace's folders
 * @throws RangeError when the workspace path isn't absolute
 *
 * @example
 * const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
 * const store = new FolderRunStore(folders.runsFolder("staging"));
 */
export async function workspaceFolders(
  profile: ProfileFolder,
  workspaceRealPath: string,
  digest: Digest,
): Promise<WorkspaceFolders> {
  if (!isAbsolutePath(profile.platform, workspaceRealPath)) {
    throw new RangeError(
      `The workspace path must be absolute, not ${JSON.stringify(workspaceRealPath)}.`,
    );
  }
  const key = await workspaceKey(profile, workspaceRealPath, digest);
  const folder = joinPath(profile.platform, profile.root, workspacesFolderName, key);
  return {
    folder,
    runsFolder(deploymentId?: string): string {
      if (deploymentId === undefined) {
        return joinPath(profile.platform, folder, "runs");
      }
      checkDeploymentId(deploymentId);
      return joinPath(profile.platform, folder, "deployments", deploymentId, "runs");
    },
    blobsFolder(): string {
      return joinPath(profile.platform, folder, "blobs");
    },
    recordsFolder(): string {
      return joinPath(profile.platform, folder, "records");
    },
    reviewFolder(): string {
      return joinPath(profile.platform, folder, "review");
    },
    harnessSettingsFolder(agentId: string, harnessId: string): string {
      checkFolderId("an agent id", agentId);
      checkFolderId("a harness id", harnessId);
      return joinPath(profile.platform, folder, harnessSettingsFolderName, agentId, harnessId);
    },
  };
}

async function workspaceKey(
  profile: ProfileFolder,
  workspaceRealPath: string,
  digest: Digest,
): Promise<string> {
  const path = keyedPath(profile.platform, workspaceRealPath);
  const hash = await digest.sha256(encodeUtf8(path));
  return bytesToHex(hash).slice(0, keyLength);
}

/**
 * The workspace path in the one spelling that is hashed. The CLI gets its
 * real path from Node and the Studio from Rust, and they spell one folder
 * differently: Rust's `canonicalize` puts the verbatim prefix `\\?\` in
 * front of the drive, and Node doesn't. Without this, the two would keep
 * separate runs.
 */
function keyedPath(platform: ProfilePlatform, realPath: string): string {
  if (platform === "windows") {
    const backslashed = withoutVerbatimPrefix(realPath.replaceAll("/", "\\"));
    return withoutTrailingSeparators(platform, backslashed).toLowerCase();
  }
  const trimmed = withoutTrailingSeparators(platform, realPath);
  if (platform === "macos") {
    // macOS volumes ignore case and Unicode form by default, and not every
    // realpath gives back the name as it is stored, so fold both.
    return trimmed.normalize("NFC").toLowerCase();
  }
  return trimmed;
}

/** A Windows path without the verbatim prefix: `\\?\` before a drive is dropped, and `\\?\UNC\server\share` becomes `\\server\share`. */
function withoutVerbatimPrefix(path: string): string {
  const verbatimShare = /^\\\\\?\\UNC\\/i;
  if (verbatimShare.test(path)) {
    return path.replace(verbatimShare, "\\\\");
  }
  return path.startsWith("\\\\?\\") ? path.slice("\\\\?\\".length) : path;
}

/**
 * Whether `deploymentId` names a deployment's folder safely: what
 * `runsFolder` takes, and what a shell that works out the folder itself
 * checks before it is given the id.
 */
export function isDeploymentId(deploymentId: string): boolean {
  return isFolderId(deploymentId);
}

/**
 * Checks a deployment id as {@link isDeploymentId} does.
 *
 * @throws RangeError when the id isn't a deployment id
 */
export function checkDeploymentId(deploymentId: string): void {
  checkFolderId("a deployment id", deploymentId);
}

/** Whether `id` can name a folder in the profile on every platform. */
function isFolderId(id: string): boolean {
  return folderIdPattern.test(id) && !windowsDeviceNames.test(id);
}

function checkFolderId(kind: string, id: string): void {
  if (!isFolderId(id)) {
    throw new RangeError(
      `Not ${kind}: ${JSON.stringify(id)}. Use 1 to 64 lowercase letters, digits, '-' or '_', starting with a letter or digit, and not a name Windows keeps for a device.`,
    );
  }
}
