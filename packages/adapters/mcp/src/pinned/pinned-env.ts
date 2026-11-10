import { isPackageManagerVariable } from "@halonicjs/app";
import type { ConnectorPin } from "@halonicjs/ports";

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
  return Object.assign(env, registryEnv(pin));
}

/** Whether a variable names a folder the launch sets itself, in any case, as Windows reads it. */
function isFolderVariable(name: string): boolean {
  const upper = name.toUpperCase();
  return folderVariables.includes(upper);
}

/** The registry setting for a pin: npm reads `npm_config_registry`, uv `UV_DEFAULT_INDEX`, pip and pipx `PIP_INDEX_URL`. */
function registryEnv(pin: ConnectorPin): Record<string, string> {
  const base = pin.registryUrl.replace(/\/+$/, "");
  if (pin.registry === "npm") return { npm_config_registry: base };
  return { UV_DEFAULT_INDEX: `${base}/simple`, PIP_INDEX_URL: `${base}/simple` };
}
