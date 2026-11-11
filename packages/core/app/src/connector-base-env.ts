// The variables a local connector program gets from the app's own
// environment without its connector naming them (HAL-6266). Anything else,
// a model key in the person's shell included, stays out unless the
// connector names it in `inheritEnv`, and a secret's name never.

import { isSecretVariableName } from "@halonicjs/std";

/**
 * What a program needs to find programs, its home and temp folders, and to
 * read and write text in the person's language. The official MCP SDKs pass
 * the same names to a stdio server (`getDefaultEnvironment`).
 */
const everywhere = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LANGUAGE",
  "TZ",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
];

/**
 * The person's own machine settings, which a pinned launch keeps too
 * (`app.package-manager-variable`): a company proxy, its certificate, and
 * where shared libraries are, as on Nix or Homebrew. A setting that turns
 * certificate checks off or loads code first, such as
 * `NODE_TLS_REJECT_UNAUTHORIZED` or `LD_PRELOAD`, is not among them.
 */
const machineSettings = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
];

/**
 * What a program needs on Windows on top: without `SYSTEMROOT` Node and
 * Python can't open a socket or make random numbers, and without
 * `PATHEXT` and `COMSPEC` a program can't start another. The same list as
 * the MCP TypeScript SDK's.
 */
const windowsOnly = [
  "APPDATA",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
];

/** Locale variables such as `LC_CTYPE`, which differ in their last word only. */
const localePrefix = "LC_";

const posixNames = new Set([...everywhere, ...machineSettings]);
const windowsNames = new Set(
  [...everywhere, ...machineSettings, ...windowsOnly].map((name) => name.toUpperCase()),
);

/**
 * The part of `env`, the app's own environment, that a local connector
 * program gets without its connector naming it: the program lookup, home,
 * user, temp and locale variables, the person's proxy, certificate and
 * library folders, and on Windows the system folders a program needs to
 * run. On Windows a name matches in any letter case, as Windows reads it
 * (`Path`, `SystemRoot`). A value that starts with `()`, an exported bash
 * function, is left out.
 *
 * @example
 * connectorBaseEnv({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-…" }, "linux"); // { PATH: "/usr/bin" }
 */
export function connectorBaseEnv(
  env: Readonly<Record<string, string | undefined>>,
  platform: string,
): Record<string, string> {
  const windows = platform === "win32";
  const base: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.startsWith("()")) continue;
    if (isBaseVariable(name, windows)) base[name] = value;
  }
  return base;
}

function isBaseVariable(name: string, windows: boolean): boolean {
  const written = windows ? name.toUpperCase() : name;
  if (written.startsWith(localePrefix)) return true;
  return windows ? windowsNames.has(written) : posixNames.has(written);
}

/**
 * What a local connector program gets from `env`, the app's own
 * environment: its base ({@link connectorBaseEnv}) and each variable its
 * connector names in `inheritEnv` that is set there. On Windows a name
 * matches in any letter case. A name that says it holds a secret is never
 * taken, even when the format check was skipped: a secret goes through
 * `secretEnv`.
 *
 * @example
 * connectorInheritedEnv({ PATH: "/usr/bin", AWS_PROFILE: "work" }, ["AWS_PROFILE"], "linux");
 * // { PATH: "/usr/bin", AWS_PROFILE: "work" }
 */
export function connectorInheritedEnv(
  env: Readonly<Record<string, string | undefined>>,
  inheritEnv: readonly string[],
  platform: string,
): Record<string, string> {
  const inherited = connectorBaseEnv(env, platform);
  const windows = platform === "win32";
  for (const name of inheritEnv) {
    if (isSecretVariableName(name)) continue;
    const written = windows
      ? Object.keys(env).find((key) => key.toUpperCase() === name.toUpperCase())
      : name;
    const value = written === undefined ? undefined : env[written];
    if (written !== undefined && value !== undefined && !value.startsWith("()")) {
      inherited[written] = value;
    }
  }
  return inherited;
}
