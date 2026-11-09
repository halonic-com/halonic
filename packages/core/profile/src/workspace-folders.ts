// What Halonic keeps for one workspace lives in the profile folder, never in
// the workspace, so nothing of it can end up in the workspace's git
// repository (HAL-2022 G4). Each workspace gets one folder there, named
// from a hash of its real path. The name is internal: nothing outside this
// file builds or reads it.

import type { Digest } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import { isAbsolutePath, joinPath } from "./native-path.ts";
import type { ProfileFolder } from "./profile-folder.ts";

/** The folder in the profile that holds one folder per workspace. */
const workspacesFolderName = "workspaces";

/**
 * How many hex characters of the SHA-256 name a workspace's folder: 128
 * bits, so two workspaces never share a folder, while the path stays short
 * enough for Windows.
 */
const keyLength = 32;

/** A deployment id, as `deployments.yaml` allows it. */
const deploymentIdPattern = /^[a-z0-9][a-z0-9_-]{0,127}$/;

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
}

/**
 * The folders a workspace has in the profile. The CLI and the Studio both
 * call this, so they read and write the same runs.
 *
 * Pass the workspace's real path: absolute, with every link resolved, as
 * the system's own `realpath` gives it. Two paths to one folder then give
 * one key. On Windows the key ignores case, because Windows file names do.
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
  };
}

async function workspaceKey(
  profile: ProfileFolder,
  workspaceRealPath: string,
  digest: Digest,
): Promise<string> {
  const path = profile.platform === "windows" ? workspaceRealPath.toLowerCase() : workspaceRealPath;
  const hash = await digest.sha256(encodeUtf8(path));
  return bytesToHex(hash).slice(0, keyLength);
}

function checkDeploymentId(deploymentId: string): void {
  if (!deploymentIdPattern.test(deploymentId) || windowsDeviceNames.test(deploymentId)) {
    throw new RangeError(
      `Not a deployment id: ${JSON.stringify(deploymentId)}. Use 1 to 128 lowercase letters, digits, '-' or '_', starting with a letter or digit.`,
    );
  }
}
