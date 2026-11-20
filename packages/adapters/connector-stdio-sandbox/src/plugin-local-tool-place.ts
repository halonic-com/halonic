import { bothSpellings, isAbsolutePath, pathsOverlap } from "@halonicjs/adapter-system-node";
import type { LocalToolPlace, PinnedRunner, StdioConfig } from "./local-tool-launch.ts";

/**
 * What the host knows when it sets up a session for one local tool of a
 * trusted plugin (HAL-12343). Every path is absolute.
 */
export interface PluginLocalToolSetting {
  /** The tool's own new folder, the one it writes to. */
  readonly workingFolder: string;
  /** A fresh private temp folder for the session. */
  readonly tempFolder: string;
  /**
   * The session's copy of the plugin's checked files (`copyCheckedPlugin`),
   * never the plugin's own folder: that is inside Halonic's data, which the
   * session can't reach. It must lie outside the working and temp folders
   * and every denied path, and hold none of them.
   */
  readonly pluginCopy: string;
  /**
   * What the program may not reach at all: the person's credential folders,
   * such as SSH keys, and Halonic's profile and data folder, which holds
   * every plugin's folder.
   */
  readonly deniedPaths: readonly string[];
  /** The Halonic bridge, or `null` for none. */
  readonly bridge: LocalToolPlace["bridge"];
  /** How long the session may last, in milliseconds: Halonic's limit, never the plugin's. */
  readonly timeLimitMs: number;
  /** The `PATH` the program gets: the host's own, without anything the plugin chose. */
  readonly path: string;
  /** For a pinned package: the runner the host found for it. */
  readonly runner?: PinnedRunner;
}

/**
 * Where a plugin's local tool runs in its session, which `localToolLaunch`
 * builds the profile from:
 *
 * - It writes only to its own new working and temp folders.
 * - A script reads the session's copy of the plugin, and can't change it.
 *   A pinned package starts in its empty folder and reads nothing of the
 *   plugin.
 * - It can't reach the denied paths: the person's credentials and all of
 *   Halonic's data, other plugins' folders included.
 * - It reaches the bridge and the hosts the manifest's `network` lists
 *   (`stdio.sites`), and nothing else.
 *
 * @throws a `RangeError` when a folder of the setting isn't an absolute
 *   path, which would be read from the host's own working folder
 * @throws a `RangeError` when the plugin's copy is on, above or inside the
 *   working folder, the temp folder or a denied path, as written or with
 *   links resolved: the sandbox lets a read allowance win over a denial on
 *   Windows, so a copy holding a denied path would reopen it there
 *
 * @example
 * pluginLocalToolPlace(stdio, { pluginCopy: "/halonic/launch-3/plugin", deniedPaths: ["/person/.ssh"], … });
 * // { readOnlyPaths: ["/halonic/launch-3/plugin"], deniedPaths: ["/person/.ssh"], sites: stdio.sites ?? [], … }
 */
export function pluginLocalToolPlace(
  stdio: StdioConfig,
  setting: PluginLocalToolSetting,
): LocalToolPlace {
  const { pluginCopy } = setting;
  const folders = [setting.workingFolder, setting.tempFolder, pluginCopy, ...setting.deniedPaths];
  const relativeFolder = folders.find((folder) => !isAbsolutePath(folder));
  if (relativeFolder !== undefined) {
    throw new RangeError(
      `The folder ${relativeFolder} isn't an absolute path, so the session's place can't be set up.`,
    );
  }
  const kept = [setting.workingFolder, setting.tempFolder, ...setting.deniedPaths];
  const overlapped = kept.find((folder) => overlapsAnySpelling(pluginCopy, folder));
  if (overlapped !== undefined) {
    throw new RangeError(
      `The plugin's copy ${pluginCopy} is on, above or inside ${overlapped}: it must be a folder of its own, apart from the session's folders and the denied paths.`,
    );
  }
  return {
    workingFolder: setting.workingFolder,
    tempFolder: setting.tempFolder,
    readOnlyPaths: stdio.pin === undefined ? [pluginCopy] : [],
    deniedPaths: [...new Set(setting.deniedPaths)],
    bridge: setting.bridge,
    sites: [...(stdio.sites ?? [])],
    timeLimitMs: setting.timeLimitMs,
    path: setting.path,
    ...(setting.runner === undefined ? {} : { runner: setting.runner }),
  };
}

/**
 * Whether `path` is on, above or inside `folder`, comparing each as written
 * and with links resolved, the way the srt sandbox compares them.
 */
function overlapsAnySpelling(path: string, folder: string): boolean {
  const folderSpellings = bothSpellings(folder);
  return bothSpellings(path).some((spelling) =>
    folderSpellings.some((other) => pathsOverlap(spelling, other)),
  );
}
