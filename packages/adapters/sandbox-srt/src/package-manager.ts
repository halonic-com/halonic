import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { posix } from "node:path";
import type { SandboxFix, SandboxPackageManager } from "@halonicjs/ports";
import type { LinuxHelper } from "./machine.ts";

/**
 * The Linux package managers, in the order they are looked for, with the
 * program that names each one. When a machine has more than one, the first
 * one found wins.
 */
const linuxPackageManagers: readonly { manager: SandboxPackageManager; program: string }[] = [
  { manager: "apt", program: "apt-get" },
  { manager: "dnf", program: "dnf" },
  { manager: "pacman", program: "pacman" },
  { manager: "zypper", program: "zypper" },
];

/**
 * Where Homebrew installs `brew`. An app started from the Finder doesn't get
 * the shell's `PATH`, so these are looked at too.
 */
const homebrewFolders = ["/opt/homebrew/bin", "/usr/local/bin"];

/**
 * The package manager on this machine that installs what srt needs: the first
 * Linux one on `PATH`, Homebrew on macOS, otherwise `null`. It only looks for
 * files, and starts nothing.
 *
 * @param platform the operating system, as Node names it
 * @param searchPath the `PATH` to look in
 * @param isProgram whether a path is a program that can be started; a test passes a fake
 */
export async function findPackageManager(
  platform: NodeJS.Platform,
  searchPath: string,
  isProgram: (path: string) => Promise<boolean> = isExecutable,
): Promise<SandboxPackageManager | null> {
  // Only Linux and macOS are looked at, and both use POSIX paths, whichever system this runs on.
  const folders = searchPath.split(posix.delimiter).filter((folder) => folder !== "");
  const onPath = async (program: string, extraFolders: readonly string[] = []) => {
    for (const folder of [...folders, ...extraFolders]) {
      if (await isProgram(posix.join(folder, program))) return true;
    }
    return false;
  };
  if (platform === "darwin") return (await onPath("brew", homebrewFolders)) ? "brew" : null;
  if (platform !== "linux") return null;
  for (const { manager, program } of linuxPackageManagers) {
    if (await onPath(program)) return manager;
  }
  return null;
}

/** Whether `path` is a file this user may start. Never rejects. */
async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The fix for missing packages: one install of all of them. The package names
 * are the same on apt, dnf, pacman, zypper and Homebrew, so only the manager
 * changes.
 */
export function installFix(
  packageManager: SandboxPackageManager | null,
  packages: readonly ("bubblewrap" | LinuxHelper)[],
): SandboxFix {
  return { kind: "install", packageManager, packages: [...packages] };
}

/** Where the AppArmor profile for bubblewrap goes. */
export const bubblewrapProfilePath = "/etc/apparmor.d/bwrap";

/**
 * The AppArmor profile that lets bubblewrap, and only it, create user
 * namespaces while the machine-wide restriction stays on. It is the profile
 * CI loads on Ubuntu 24.04 before the fence tests, and a test checks that the
 * two match.
 */
export const bubblewrapProfile = `abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,

  include if exists <local/bwrap>
}
`;

/** The fix for `user-namespaces-restricted`: the profile above, never the sysctl. A fresh one each time. */
export function appArmorFix(): SandboxFix {
  return {
    kind: "apparmor-profile",
    program: "/usr/bin/bwrap",
    path: bubblewrapProfilePath,
    profile: bubblewrapProfile,
  };
}
