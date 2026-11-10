import type { ConnectorPin } from "@halonicjs/ports";
import { expect } from "vitest";

/**
 * A program a `stdio` connector started, as the adapter spawned it: the
 * `command`, `args` and full `env` handed to the operating system, the
 * folder it started in, and the pin it started (`null` for a program
 * without one).
 */
export interface ConnectorLaunch {
  pin: ConnectorPin | null;
  folder: string;
  command: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
}

/**
 * The machine's own network settings in the adapter's process environment,
 * as a company proxy and its certificate would be. The port says a pinned
 * launch keeps them: they belong to the person, not the workspace.
 */
const machineEnv: Readonly<Record<string, string>> = {
  HTTPS_PROXY: "http://proxy.acme.test:3128",
  NODE_EXTRA_CA_CERTS: "./acme-proxy-ca.pem",
};

/**
 * The environment the suite gives the adapter as its own process's: every
 * variable it may not pass on to a pinned program, each set to move the
 * registry or run code first, next to a harmless `PATH` and the machine's
 * own proxy and certificate.
 */
export const contractInheritedEnv: Readonly<Record<string, string>> = {
  PATH: "/usr/bin",
  ...machineEnv,
  npm_config_registry: "https://evil.acme.test/npm",
  NPM_CONFIG_USERCONFIG: "./evil.npmrc",
  NODE_OPTIONS: "--require ./evil.js",
  UV_INDEX_URL: "https://evil.acme.test/simple",
  UV_EXTRA_INDEX_URL: "https://evil.acme.test/extra",
  PIP_INDEX_URL: "https://evil.acme.test/simple",
  PYTHONPATH: "./evil",
};

/** The npm and PyPI runners a pinned program may be started with, by program name. */
const runners: Record<ConnectorPin["registry"], ReadonlySet<string>> = {
  npm: new Set(["npx", "npm", "pnpm", "pnpx", "yarn", "bunx", "bun"]),
  pypi: new Set(["uvx", "uv", "pipx"]),
};

/** The variables that point a PyPI runner at its index. */
const pypiIndexVariables = new Set(["uv_default_index", "uv_index_url", "pip_index_url"]);

/** Variables `app.package-runner-launch` blocks, by name or prefix, in lowercase. */
const blockedNames = new Set([
  "node_options",
  "node_path",
  "pythonpath",
  "pythonstartup",
  "pythonhome",
]);
const blockedPrefixes = [
  "npm_config_",
  "yarn_",
  "pnpm_",
  "bun_",
  "corepack_",
  "uv_",
  "pip_",
  "pipx_",
];

/**
 * Expects `launch` to run the pin's package at exactly its version, through
 * a runner of the pin's registry, pointed at `registryUrl`, with none of
 * {@link contractInheritedEnv}'s blocked variables passed on, and the
 * machine's own proxy and certificate kept.
 */
export function expectSpawnedPinned(launch: ConnectorLaunch, pin: ConnectorPin): void {
  expect(runners[pin.registry].has(programName(launch.command))).toBe(true);
  // A bare name may stay, as in `uvx --from mail-mcp==2.3.1 mail-mcp`; every
  // version named must be the pin's, and at least one must name it.
  const versioned = launch.args
    .flatMap(packageSpecs)
    .filter((spec) => namesPackage(spec, pin) && spec !== leadingName(spec, pin))
    .map((spec) => asRequirement(spec, pin));
  expect(new Set(versioned)).toEqual(new Set([exactSpec(pin)]));
  expectRegistrySetting(launch.env, pin);
  for (const [name, value] of Object.entries(contractInheritedEnv)) {
    if (isBlocked(name)) expect(launch.env[name]).not.toBe(value);
  }
  for (const [name, value] of Object.entries(machineEnv)) expect(launch.env[name]).toBe(value);
}

/** Expects `folder` to be neither `other`, nor inside it, nor around it. */
export function expectOutside(folder: string, other: string): void {
  const inner = slashes(folder);
  const outer = slashes(other);
  expect(inner).not.toBe(outer);
  expect(inner.startsWith(`${outer}/`)).toBe(false);
  expect(outer.startsWith(`${inner}/`)).toBe(false);
}

/** A path with Windows backslashes written as slashes, so one comparison serves every platform. */
function slashes(path: string): string {
  return path.replaceAll("\\", "/");
}

/** The package specs an argument holds: itself, or the value of a `--option=value`. */
function packageSpecs(arg: string): string[] {
  const equals = arg.indexOf("=");
  if (arg.startsWith("--") && equals !== -1) return arg.slice(equals + 1).split(",");
  return [arg];
}

/** The pinned package at its version, as its registry's runners write it. */
function exactSpec(pin: ConnectorPin): string {
  return pin.registry === "npm"
    ? `${pin.package}@${pin.version}`
    : `${pin.package}==${pin.version}`;
}

/** A PyPI spec as a requirement: `uvx` documents `mail-mcp@2.3.1` for `mail-mcp==2.3.1`. */
function asRequirement(spec: string, pin: ConnectorPin): string {
  return pin.registry === "pypi" ? spec.replace(/^([A-Za-z0-9._-]+)@/, "$1==") : spec;
}

/** Whether `spec` names the pin's package, with or without a version. */
function namesPackage(spec: string, pin: ConnectorPin): boolean {
  const name = leadingName(spec, pin);
  return pin.registry === "npm" ? name === pin.package : pypiName(name) === pypiName(pin.package);
}

/** The package name `spec` starts with, before any version. */
function leadingName(spec: string, pin: ConnectorPin): string {
  if (pin.registry === "npm") {
    const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
    return at === -1 ? spec : spec.slice(0, at);
  }
  return /^[A-Za-z0-9._-]*/.exec(spec)?.[0] ?? "";
}

/** A PyPI name as PyPI compares it: lowercase, with runs of `-`, `_` and `.` as one `-`. */
function pypiName(name: string): string {
  return name.toLowerCase().replaceAll(/[-_.]+/g, "-");
}

/**
 * Expects the registry setting in `env` to be the pin's: `npm_config_registry`
 * at `registryUrl` for npm, and for PyPI at least one of `UV_DEFAULT_INDEX`,
 * `UV_INDEX_URL` and `PIP_INDEX_URL` at `{registryUrl}/simple`, in any case.
 * Every such variable present must say the same.
 */
function expectRegistrySetting(env: Readonly<Record<string, string>>, pin: ConnectorPin): void {
  const base = withoutTrailingSlash(pin.registryUrl);
  const [wanted, isSetting] =
    pin.registry === "npm"
      ? [base, (name: string) => name === "npm_config_registry"]
      : [`${base}/simple`, (name: string) => pypiIndexVariables.has(name)];
  const settings = Object.entries(env).filter(([name]) => isSetting(name.toLowerCase()));
  expect(settings.length).toBeGreaterThan(0);
  for (const [, value] of settings) expect(withoutTrailingSlash(value)).toBe(wanted);
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The program a command starts: without its folder, in lowercase, and without a Windows ending. */
function programName(command: string): string {
  const file = command.split(/[\\/]/).at(-1) ?? "";
  return file.toLowerCase().replace(/\.(cmd|exe|bat|ps1)$/, "");
}

function isBlocked(name: string): boolean {
  const lower = name.toLowerCase();
  return blockedNames.has(lower) || blockedPrefixes.some((prefix) => lower.startsWith(prefix));
}
