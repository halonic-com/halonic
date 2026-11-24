import { homeDeniedPaths, type RealPath, realPathOnDisk } from "@halonicjs/adapter-harness-kit";
import type { ProfileFolder } from "@halonicjs/profile";

/**
 * What a fenced workspace connector may never reach: Halonic's profile, and
 * the person's credential folders, as for a plugin's local tool, since both
 * run in the same sandbox.
 *
 * @param profile - Halonic's profile folder
 * @param home - the person's home folder, absolute
 * @param platform - the system, as `process.platform` names it
 * @param realPath - resolves a path to its real place on disk
 */
export async function connectorDeniedPaths(
  profile: Pick<ProfileFolder, "root">,
  home: string,
  platform: NodeJS.Platform,
  realPath: RealPath = realPathOnDisk,
): Promise<string[]> {
  return [profile.root, ...(await homeDeniedPaths(home, platform, { realPath }))];
}
