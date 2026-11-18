import { isAbsolute, relative, sep } from "node:path";
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
   * session can't reach. It must lie outside the working folder and every
   * denied path.
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
 * @throws a `RangeError` when the plugin's copy is inside the working
 *   folder or a denied path, where the session couldn't read it as it is
 *
 * @example
 * pluginLocalToolPlace(stdio, { pluginCopy: "/halonic/launch-1/plugin", deniedPaths: ["/person/.ssh"], … });
 * // { readOnlyPaths: ["/halonic/launch-1/plugin"], deniedPaths: ["/person/.ssh"], sites: stdio.sites ?? [], … }
 */
export function pluginLocalToolPlace(
  stdio: StdioConfig,
  setting: PluginLocalToolSetting,
): LocalToolPlace {
  const { pluginCopy } = setting;
  const holder = [setting.workingFolder, ...setting.deniedPaths].find((folder) =>
    isInsideOrSame(pluginCopy, folder),
  );
  if (holder !== undefined) {
    throw new RangeError(
      `The plugin's copy ${pluginCopy} is inside ${holder}, so the session can't read it as it is.`,
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

/** Whether `path` is `folder` or inside it, comparing the paths as written. */
function isInsideOrSame(path: string, folder: string): boolean {
  const from = relative(folder, path);
  const outside = from === ".." || from.startsWith(`..${sep}`) || isAbsolute(from);
  return !outside;
}
