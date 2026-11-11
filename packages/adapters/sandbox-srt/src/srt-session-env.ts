import { realpathSync } from "node:fs";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";

/**
 * Variables sandbox-runtime reads from its own environment to find a parent
 * proxy. For that traffic it skips the check against private and loopback
 * addresses, so the launcher never gets them, whoever set them.
 */
const proxyVariables = new Set(
  ["http_proxy", "https_proxy", "all_proxy", "no_proxy", "grpc_proxy"].flatMap((name) => [
    name,
    name.toUpperCase(),
  ]),
);

/**
 * What a variable name may be. `env` runs without `-i`, so a name that starts
 * with `-` would be read as one of its options (`--unset=HTTP_PROXY`).
 */
const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** @throws when the profile has a variable whose name is not a plain one. */
export function assertVariableNames(profile: SandboxProfile): void {
  for (const name of Object.keys(profile.env)) {
    if (!variableName.test(name)) {
      throw new Error(`the profile has a variable with a name that is not plain: ${name}`);
    }
  }
}

/** A folder as the PATH may name it: as given, and with symlinks resolved (`/var` is `/private/var` on macOS). */
function folderNames(folder: string): string[] {
  const names = [resolve(folder)];
  try {
    names.push(realpathSync(folder));
  } catch {
    // The folder is gone or unreadable: only its given name counts.
  }
  return names;
}

/**
 * A `PATH` without entries inside the session's private folder, so nothing
 * the launcher or the program runs is ever found there. Relative entries with
 * a `..` segment are dropped too: they resolve against the program's folder,
 * which Halonic cannot know, so they could lead into the private folder.
 */
function withoutPrivateFolder(path: string, privateFolder: string | undefined): string {
  if (privateFolder === undefined) return path;
  const folders = folderNames(privateFolder);
  return path
    .split(delimiter)
    .filter((entry) => {
      if (entry === "") return true;
      if (!isAbsolute(entry) && entry.split(/[\\/]/).includes("..")) return false;
      return !folderNames(entry).some((name) => folders.some((folder) => isInside(folder, name)));
    })
    .join(delimiter);
}

/**
 * The host's `PATH` without relative entries, without entries the program
 * can write and without entries in the private folder.
 */
function safePath(profile: SandboxProfile, hostPath: string, privateFolder?: string): string {
  const writable = [resolve(profile.workingFolder), resolve(profile.tempFolder)];
  return withoutPrivateFolder(
    hostPath
      .split(delimiter)
      .filter(
        (entry) =>
          isAbsolute(entry) && !writable.some((folder) => isInside(folder, resolve(entry))),
      )
      .join(delimiter),
    privateFolder,
  );
}

/**
 * The environment of the launcher, which runs outside the fence: the safe
 * host `PATH` and a temp folder. Nothing from the profile, so nothing the
 * program influences (a planted `bwrap` on the path, `NODE_OPTIONS`,
 * `LD_PRELOAD`) runs before the fence exists. With a `launcherTemp` (see
 * {@link makeLauncherTemp}), that is the launcher's own temp folder, and the
 * session's is handed to srt as the one it sets for the program.
 */
export function launcherEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined> = process.env,
  privateFolder?: string,
  launcherTemp: string | null = null,
): Record<string, string> {
  const env = baseEnv(profile, hostEnv, privateFolder);
  if (launcherTemp !== null) {
    env["TMPDIR"] = launcherTemp;
    env["CLAUDE_CODE_TMPDIR"] = profile.tempFolder;
  }
  if (process.platform === "win32") {
    // Node and srt don't start without the system folder, and cmd.exe needs ComSpec and PATHEXT.
    // Windows reads names without regard to case, so find them that way.
    for (const wanted of windowsLauncherVariables) {
      const found = Object.keys(hostEnv).find(
        (name) => name.toUpperCase() === wanted.toUpperCase(),
      );
      const value = found === undefined ? undefined : hostEnv[found];
      if (value !== undefined) env[wanted] = value;
    }
    env["TEMP"] = profile.tempFolder;
    env["TMP"] = profile.tempFolder;
  }
  return env;
}

/** What the launcher needs from the host on Windows: where the system and the user's folders are, never anything the program can influence. */
const windowsLauncherVariables = [
  "SystemRoot",
  "SystemDrive",
  "windir",
  "ComSpec",
  "PATHEXT",
  // srt-win finds the user's state folders through these.
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "USERNAME",
  "USERDOMAIN",
  "COMPUTERNAME",
];

/** The host's safe `PATH` and the session's temp folder, for the launcher and the program alike. */
export function baseEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined>,
  privateFolder?: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  const hostPath = hostEnv["PATH"];
  if (hostPath !== undefined) env["PATH"] = safePath(profile, hostPath, privateFolder);
  env["TMPDIR"] = profile.tempFolder;
  return env;
}

/**
 * The variables the program gets, set inside the fence on top of what srt
 * sets there (its proxy variables): the safe host `PATH` when the profile has
 * none, the session's temp folder and the profile's variables. Never the rest
 * of the host's environment, and never a proxy variable of the profile. A
 * `PATH` of the profile loses its entries in the private folder.
 *
 * @throws when a variable of the profile has a name that is not plain.
 */
export function programEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined> = process.env,
  privateFolder?: string,
): Record<string, string> {
  assertVariableNames(profile);
  // Not the launcher's: on Windows its system variables would replace the sandbox account's own.
  const env = baseEnv(profile, hostEnv, privateFolder);
  for (const [name, value] of Object.entries(profile.env)) {
    if (proxyVariables.has(name)) continue;
    env[name] = name === "PATH" ? withoutPrivateFolder(value, privateFolder) : value;
  }
  return env;
}

/**
 * Whether the profile reaches no network at all: no bridge and no allowed
 * site. Its programs then get none of what srt sets inside the fence, so no
 * proxy variable names a way out (I5 design, HAL-958 section 9).
 */
export function reachesNoNetwork(profile: SandboxProfile): boolean {
  return profile.network.bridge === null && profile.network.allowedSites.length === 0;
}

/** Whether `child` is `parent` or inside it. */
export function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
