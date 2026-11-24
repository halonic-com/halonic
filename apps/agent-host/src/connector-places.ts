import { homeDeniedPaths, type RealPath } from "@halonicjs/adapter-harness-kit";
import { profileTrustStore } from "./profile-folder.ts";

/** Where the host looks for the person's credential folders, and how it finds their real places. */
export interface ConnectorHome {
  /** The person's home folder, absolute. */
  readonly folder: string;
  /** The system, as `process.platform` names it. */
  readonly platform: NodeJS.Platform;
  /** Resolves a path to its real place on disk. */
  readonly realPath: RealPath;
}

/** The workspace folders connectors may use: Halonic's own profile folder is never one. */
export function workspaceRootsOf(roots: readonly string[], profileFolder: string | undefined) {
  // A list of its own, which grows as the shell names opened folders (`shellChannelOf`).
  return roots.filter((root) => root !== profileFolder);
}

/**
 * What workspace connectors may use and never reach: Halonic's own profile folder is never a workspace, and is denied.
 * A fenced workspace connector runs in the same sandbox as a plugin's local tool, so it never reaches
 * the person's credential folders either.
 * The host checks every connector's trust grant against the trust records of that same folder.
 */
export async function connectorPlaces(
  roots: readonly string[],
  profileFolder: string | undefined,
  home: ConnectorHome,
) {
  const credentialFolders = await homeDeniedPaths(home.folder, home.platform, {
    realPath: home.realPath,
  });
  return {
    workspaceRoots: workspaceRootsOf(roots, profileFolder),
    deniedPaths:
      profileFolder === undefined ? credentialFolders : [profileFolder, ...credentialFolders],
    trustStore: profileFolder === undefined ? undefined : profileTrustStore(profileFolder),
  };
}
