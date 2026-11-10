import { devNull } from "node:os";
import { join, posix, win32 } from "node:path";
import { isPackageManagerVariable } from "@halonicjs/app";
import type { ConnectorPin } from "@halonicjs/ports";
import { emptyNpmrc } from "./launch-folders.ts";

/**
 * The variables that tell a runner where its home, config, cache and
 * temporary files are. A pinned launch points them all at its own folder,
 * so the runner reads none of the person's package-manager config and
 * fetches into a cache of its own.
 */
const folderVariables = [
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "TMPDIR",
  "TEMP",
  "TMP",
];

/**
 * The environment a pinned program starts with, before its secrets: what
 * the launcher inherits, without the package-manager and language variables
 * (`app.package-manager-variable`), with the connector's own `env`, which
 * `checkPackageRunnerLaunch` has checked, then the launch folder and the
 * pin's registry, which nothing before can change.
 *
 * An inherited proxy, certificate or preload stays: those are the person's
 * own machine settings, such as a company proxy (`ports/connector-client.ts`).
 */
export function pinnedEnv(
  pin: ConnectorPin,
  inheritedEnv: Readonly<Record<string, string>>,
  connectorEnv: Readonly<Record<string, string>>,
  folder: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inheritedEnv)) {
    if (!isPackageManagerVariable(name) && !isFolderVariable(name)) env[name] = value;
  }
  Object.assign(env, connectorEnv);
  for (const name of folderVariables) env[name] = folder;
  return Object.assign(env, registryEnv(pin, folder));
}

/**
 * `env` with `folders` first on its `PATH`, before what it inherited, so
 * the runner starts the `node` the launcher found with it. On Windows the
 * variable is found in any letter case (`Path`) and its folders are
 * separated by `;`.
 */
export function withFoldersFirst(
  env: Readonly<Record<string, string>>,
  folders: readonly string[],
  platform: NodeJS.Platform,
): Record<string, string> {
  const windows = platform === "win32";
  const name = windows
    ? (Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "Path")
    : "PATH";
  const inherited = env[name];
  const entries = inherited === undefined || inherited === "" ? folders : [...folders, inherited];
  return { ...env, [name]: entries.join(windows ? win32.delimiter : posix.delimiter) };
}

/** Whether a variable names a folder the launch sets itself, in any case, as Windows reads it. */
function isFolderVariable(name: string): boolean {
  const upper = name.toUpperCase();
  return folderVariables.includes(upper);
}

/**
 * The registry setting for a pin, and the settings that keep every other
 * config out. npm reads `npm_config_registry`, and its user and global
 * config point at the launch folder's empty {@link emptyNpmrc}, so a system-wide
 * `$PREFIX/etc/npmrc` can't add a scope's registry. uv reads
 * `UV_DEFAULT_INDEX`, reads no `uv.toml` (`UV_NO_CONFIG`) and downloads no
 * Python of its own (`UV_PYTHON_DOWNLOADS`). pip and pipx read
 * `PIP_INDEX_URL` and no `pip.conf` (`PIP_CONFIG_FILE` set to the null
 * device, which pip reads as "no config files").
 */
function registryEnv(pin: ConnectorPin, folder: string): Record<string, string> {
  const base = pin.registryUrl.replace(/\/+$/, "");
  if (pin.registry === "npm") {
    const npmrc = join(folder, emptyNpmrc);
    return {
      npm_config_registry: base,
      npm_config_userconfig: npmrc,
      npm_config_globalconfig: npmrc,
    };
  }
  return {
    UV_DEFAULT_INDEX: `${base}/simple`,
    UV_NO_CONFIG: "1",
    UV_PYTHON_DOWNLOADS: "never",
    PIP_INDEX_URL: `${base}/simple`,
    PIP_CONFIG_FILE: devNull,
  };
}
