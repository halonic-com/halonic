// The profile folder holds what Halonic keeps for one person on one
// computer: runs, their blobs, trust records and settings. The CLI and the
// Studio both find it with `profileFolder`, so they always share one
// (HAL-2022 G4, applied to the Studio on HAL-2077). The Studio doesn't use
// Tauri's own app data folder, which would differ from the CLI's.

import {
  isAbsolutePath,
  joinPath,
  type ProfilePlatform,
  withoutTrailingSeparators,
} from "./native-path.ts";

/** The name of the folder Halonic adds under the system's user data folder. */
const folderName = "halonic";

/** The name of the folder in the profile that holds the trust records. */
const trustFolderName = "trust";

/** The name of the folder in the profile that holds the sandbox's crash journals. */
const sandboxJournalFolderName = "sandbox-journals";

/** The name of the folder in the profile that holds the plugins, one folder each. */
const pluginsFolderName = "plugins";

/** The name of the folder in the profile that holds the plugins' records. */
const pluginRecordsFolderName = "plugin-records";

/** What {@link profileFolder} reads from the system; the adapter fills it in. */
export interface ProfileEnvironment {
  /** The system Halonic runs on. */
  readonly platform: ProfilePlatform;
  /** The person's home folder, absolute. */
  readonly homeFolder: string;
  /**
   * The environment variables. Only `HALONIC_HOME`, `LOCALAPPDATA` (Windows)
   * and `XDG_DATA_HOME` (Linux) are read. An empty value counts as unset.
   */
  readonly variables: Readonly<Record<string, string | undefined>>;
}

/** The profile folder, with the system its path belongs to. */
export interface ProfileFolder {
  /** The system the path belongs to, so paths under it are joined its way. */
  readonly platform: ProfilePlatform;
  /** The folder, absolute, without a trailing separator. It may not exist yet. */
  readonly root: string;
}

/**
 * Finds the profile folder: `HALONIC_HOME` when it is set, or else the
 * `halonic` folder in the system's user data folder:
 *
 * - Windows: `%LOCALAPPDATA%\halonic`, or `<home>\AppData\Local\halonic`
 * - macOS: `<home>/Library/Application Support/halonic`
 * - Linux: `$XDG_DATA_HOME/halonic`, or `<home>/.local/share/halonic`
 *
 * A relative `XDG_DATA_HOME` is ignored, as the XDG rules ask. A relative
 * `HALONIC_HOME` is refused instead: the person set it on purpose, and
 * resolving it against whatever folder a command started in would split
 * their runs across many profiles.
 *
 * @param environment - the system, home folder and environment variables
 * @returns the profile folder; nothing is created
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 *
 * @example
 * profileFolder({ platform: "linux", homeFolder: "/srv/acme", variables: {} });
 * // { platform: "linux", root: "/srv/acme/.local/share/halonic" }
 */
export function profileFolder(environment: ProfileEnvironment): ProfileFolder {
  const { platform } = environment;
  const chosen = variableOf(environment, "HALONIC_HOME");
  if (chosen !== undefined) {
    if (!isAbsolutePath(platform, chosen)) {
      throw new RangeError(
        `HALONIC_HOME must be an absolute folder, not ${JSON.stringify(chosen)}.`,
      );
    }
    return { platform, root: withoutTrailingSeparators(platform, chosen) };
  }
  return { platform, root: joinPath(platform, userDataFolder(environment), folderName) };
}

/**
 * The folder for the trust records, `trust` in the profile folder. The CLI's
 * `FileTrustStore` and the desktop shell's trust store both keep their
 * records there, so a source trusted in one is trusted in the other.
 *
 * @param profile - the profile folder, from {@link profileFolder}
 * @returns the trust folder, joined the profile's way; nothing is created
 *
 * @example
 * trustFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" });
 * // "/srv/acme/.local/share/halonic/trust"
 */
export function trustFolder(profile: ProfileFolder): string {
  return joinPath(profile.platform, profile.root, trustFolderName);
}

/**
 * The folder for the sandbox's crash journals, `sandbox-journals` in the
 * profile folder. It is the person's own: the sandbox keeps it from the
 * programs it runs.
 *
 * @param profile - the profile folder, from {@link profileFolder}
 * @returns the journal folder, joined the profile's way; nothing is created
 *
 * @example
 * sandboxJournalFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" });
 * // "/srv/acme/.local/share/halonic/sandbox-journals"
 */
export function sandboxJournalFolder(profile: ProfileFolder): string {
  return joinPath(profile.platform, profile.root, sandboxJournalFolderName);
}

/** The system's folder for a person's application data. */
function userDataFolder(environment: ProfileEnvironment): string {
  const { platform } = environment;
  const home = homeFolderOf(environment);
  if (platform === "windows") {
    const localAppData = variableOf(environment, "LOCALAPPDATA");
    if (localAppData !== undefined && isAbsolutePath(platform, localAppData)) {
      return localAppData;
    }
    return joinPath(platform, home, "AppData", "Local");
  }
  if (platform === "macos") {
    return joinPath(platform, home, "Library", "Application Support");
  }
  const xdgDataHome = variableOf(environment, "XDG_DATA_HOME");
  if (xdgDataHome !== undefined && isAbsolutePath(platform, xdgDataHome)) {
    return xdgDataHome;
  }
  return joinPath(platform, home, ".local", "share");
}

function homeFolderOf(environment: ProfileEnvironment): string {
  const { platform, homeFolder } = environment;
  if (!isAbsolutePath(platform, homeFolder)) {
    throw new RangeError(`The home folder must be absolute, not ${JSON.stringify(homeFolder)}.`);
  }
  return homeFolder;
}

function variableOf(environment: ProfileEnvironment, name: string): string | undefined {
  const value = environment.variables[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * The folder for the plugins, `plugins` in the profile folder: one folder
 * each, named by the plugin's id. It is the person's own, never a
 * workspace's, so a plugin is one thing for every workspace.
 *
 * @param profile - the profile folder, from {@link profileFolder}
 * @returns the plugins folder, joined the profile's way; nothing is created
 *
 * @example
 * pluginsFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" });
 * // "/srv/acme/.local/share/halonic/plugins"
 */
export function pluginsFolder(profile: ProfileFolder): string {
  return joinPath(profile.platform, profile.root, pluginsFolderName);
}

/**
 * The folder for the plugins' records, `plugin-records` in the profile
 * folder: each plugin's setting values and where it was installed from. The
 * CLI and the Studio both keep them there, so a plugin set up in one is set
 * up in the other.
 *
 * @param profile - the profile folder, from {@link profileFolder}
 * @returns the records folder, joined the profile's way; nothing is created
 *
 * @example
 * pluginRecordsFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" });
 * // "/srv/acme/.local/share/halonic/plugin-records"
 */
export function pluginRecordsFolder(profile: ProfileFolder): string {
  return joinPath(profile.platform, profile.root, pluginRecordsFolderName);
}
