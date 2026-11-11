// What a harness run's sandbox denies, by group (threat model 4.6): the
// person's SSH keys, cloud sign-ins, browser data, password stores and their
// own Claude Code and Codex settings, all in the home folder, and Halonic's
// own data folder. The groups are the `sandbox.opened` event's
// `deniedPathGroupCodes`, so the run log and the screens name what the
// profile denies.

import { join } from "node:path";
import type { DeniedPathGroup, DeniedPathGroupCode } from "@halonicjs/events";
import type { ProfileDisk } from "./working-folder.ts";
import { isInsideOrSame } from "./working-folder.ts";

/** The systems a harness runs on, as Node names them. */
type HarnessPlatform = "linux" | "darwin" | "win32";

/** Paths in the home folder, with `/` between their names: on every system, and on one only. */
interface HomePaths {
  readonly everywhere: readonly string[];
  readonly only?: Readonly<Partial<Record<HarnessPlatform, readonly string[]>>>;
}

/** The groups found in the home folder; `halonic-data` is the data folder's own. */
const homeGroups: Readonly<Record<Exclude<DeniedPathGroupCode, "halonic-data">, HomePaths>> = {
  "ssh-keys": { everywhere: [".ssh"] },
  "cloud-sign-ins": {
    everywhere: [
      ".aws",
      ".azure",
      ".config/gcloud",
      ".kube",
      ".docker",
      ".config/gh",
      ".netrc",
      ".git-credentials",
    ],
    only: { win32: ["AppData/Roaming/gcloud", "AppData/Roaming/GitHub CLI"] },
  },
  "browser-data": {
    everywhere: [],
    only: {
      linux: [".config/google-chrome", ".config/chromium", ".config/BraveSoftware", ".mozilla"],
      darwin: [
        "Library/Application Support/Google/Chrome",
        "Library/Application Support/Chromium",
        "Library/Application Support/BraveSoftware",
        "Library/Application Support/Microsoft Edge",
        "Library/Application Support/Firefox",
        "Library/Safari",
        "Library/Cookies",
      ],
      win32: [
        "AppData/Local/Google/Chrome/User Data",
        "AppData/Local/Chromium/User Data",
        "AppData/Local/BraveSoftware",
        "AppData/Local/Microsoft/Edge/User Data",
        "AppData/Roaming/Mozilla",
      ],
    },
  },
  "password-stores": {
    everywhere: [".gnupg", ".password-store"],
    only: {
      linux: [".local/share/keyrings"],
      darwin: ["Library/Keychains"],
      win32: [
        "AppData/Roaming/Microsoft/Credentials",
        "AppData/Local/Microsoft/Credentials",
        "AppData/Roaming/Microsoft/Protect",
      ],
    },
  },
  "agent-settings": { everywhere: [".claude", ".claude.json", ".codex"] },
};

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
  for (const [code, paths] of Object.entries(homeGroups)) {
    const named = [...paths.everywhere, ...(paths.only?.[platform as HarnessPlatform] ?? [])];
    const found: string[] = [];
    for (const path of named) {
      const real = await realOrNothing(join(home, ...path.split("/")), disk);
      if (real !== null && !found.includes(real)) found.push(real);
    }
    if (found.length > 0) groups.push({ code: code as DeniedPathGroupCode, paths: found });
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
