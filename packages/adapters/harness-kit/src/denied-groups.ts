// What a harness run's sandbox denies, by group (threat model 4.6): the
// paths in the person's home folder that the ports' `deniedHomePaths`
// lists, and Halonic's own data folder. The groups are the `sandbox.opened`
// event's `deniedPathGroupCodes`, so the run log and the screens name what
// the profile denies.

import { join } from "node:path";
import type { DeniedPathGroup } from "@halonicjs/events";
import {
  deniedHomePaths,
  type HomeDeniedGroupCode,
  type HomePlatform,
  homePathsOf,
} from "@halonicjs/ports";
import type { ProfileDisk } from "./working-folder.ts";
import { isInsideOrSame } from "./working-folder.ts";

/**
 * The denied groups in the person's home folder, each path at its real
 * place. A path that isn't there is left out, and so is a group with no
 * path, because there is nothing in it to read.
 *
 * @param home - the person's home folder, absolute
 * @param platform - the system, as `process.platform` names it
 */
export async function homeDeniedGroups(
  home: string,
  platform: NodeJS.Platform,
  disk: Pick<ProfileDisk, "realPath">,
): Promise<DeniedPathGroup[]> {
  const groups: DeniedPathGroup[] = [];
  for (const [code, paths] of Object.entries(deniedHomePaths)) {
    const named = homePathsOf(paths, platform as HomePlatform);
    const found: string[] = [];
    for (const path of named) {
      const real = await realOrNothing(join(home, ...path.split("/")), disk);
      if (real !== null && !found.includes(real)) found.push(real);
    }
    if (found.length > 0) groups.push({ code: code as HomeDeniedGroupCode, paths: found });
  }
  return groups;
}

/**
 * The entries in `folder` that aren't on the way to a path in `kept`, all
 * the way down: the folder itself when nothing kept is in it, nothing when a
 * kept path holds it. The profile reopens a proposal folder's entries around
 * the working folder this way, and on Windows also denies the data folder's
 * entries around the run's own folders by name (see `HarnessProfiles`). The
 * runner's untrusted profile hides the home folder the same way.
 *
 * @param folder - a real path
 * @param kept - real paths
 * @throws when a folder on the way to a kept path can't be listed
 */
export async function entriesAround(
  folder: string,
  kept: readonly string[],
  disk: Pick<ProfileDisk, "listFolder">,
): Promise<string[]> {
  if (kept.some((path) => isInsideOrSame(folder, path))) return [];
  const keptInside = kept.filter((path) => isInsideOrSame(path, folder));
  if (keptInside.length === 0) return [folder];
  const around: string[] = [];
  for (const name of await disk.listFolder(folder)) {
    const entry = join(folder, name);
    const onTheWay = keptInside.some((path) => isInsideOrSame(path, entry));
    around.push(...(onTheWay ? await entriesAround(entry, keptInside, disk) : [entry]));
  }
  return around;
}

async function realOrNothing(
  path: string,
  disk: Pick<ProfileDisk, "realPath">,
): Promise<string | null> {
  try {
    return await disk.realPath(path);
  } catch {
    return null;
  }
}
