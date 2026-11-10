import {
  checkPackageRunnerLaunch,
  checkResolvedVersion,
  type StdioTransport,
} from "@halonicjs/app";
import type { ConnectorPin, HttpClient } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";

/**
 * Checks the pin of a `stdio` connector before its program starts, the way
 * a real launcher does: the launch itself (`app.package-runner-launch`),
 * then the version at the pin's registry, asked only at `registryUrl`.
 *
 * @returns the pin to start with, `null` for a program without one, or the
 *   reason to refuse
 */
export async function checkPinnedLaunch(
  transport: StdioTransport,
  http: HttpClient,
): Promise<Result<ConnectorPin | null, string>> {
  const launch = checkPackageRunnerLaunch(transport);
  if (!launch.ok || launch.value === null) return launch;
  const pin = launch.value;
  const resolved = await lookUpVersion(pin, http);
  if (!resolved.ok) return resolved;
  const same = checkResolvedVersion(pin, resolved.value);
  return same.ok ? ok(pin) : same;
}

/** What the registry says about the pinned version: the package and version it lists. */
async function lookUpVersion(
  pin: ConnectorPin,
  http: HttpClient,
): Promise<Result<{ package: string; version: string }, string>> {
  const base = pin.registryUrl.replace(/\/+$/, "");
  const url =
    pin.registry === "npm"
      ? `${base}/${pin.package.replace("/", "%2f")}`
      : `${base}/pypi/${pin.package}/${pin.version}/json`;
  let body: unknown;
  try {
    const response = await http.fetch(url);
    if (!response.ok) {
      return err(`${pin.registryUrl} doesn't list ${pin.package} ${pin.version}`);
    }
    body = await response.json();
  } catch {
    return err(`${pin.registryUrl} can't be reached to look up ${pin.package} ${pin.version}`);
  }
  const listed = pin.registry === "npm" ? npmListed(body, pin.version) : pypiListed(body);
  if (listed === undefined) {
    return err(`${pin.registryUrl} doesn't list ${pin.package} ${pin.version}`);
  }
  return ok(listed);
}

/** The version from an npm package document, when it lists it. */
function npmListed(
  body: unknown,
  version: string,
): { package: string; version: string } | undefined {
  const name = field(body, "name");
  const listed = field(field(field(body, "versions"), version), "version");
  return typeof name === "string" && typeof listed === "string"
    ? { package: name, version: listed }
    : undefined;
}

/** The version from a PyPI JSON answer for one release. */
function pypiListed(body: unknown): { package: string; version: string } | undefined {
  const info = field(body, "info");
  const name = field(info, "name");
  const version = field(info, "version");
  return typeof name === "string" && typeof version === "string"
    ? { package: name, version }
    : undefined;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, key)) return undefined;
  return (value as Record<string, unknown>)[key];
}

/** A program as it is spawned: its command, arguments and whole environment. */
export interface Spawn {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * What a real launcher spawns for a `stdio` connector, on top of the
 * environment it inherits. Without a pin, the command as configured. With
 * one, the first argument naming the pin's package names it at the pin's
 * version, inherited variables that `app.package-runner-launch` blocks are
 * dropped, and the registry is set from `registryUrl`.
 */
export function spawnFor(
  transport: StdioTransport,
  pin: ConnectorPin | null,
  inheritedEnv: Readonly<Record<string, string>>,
): Spawn {
  const { command, args, env } = transport;
  if (pin === null) return { command, args: [...args], env: { ...inheritedEnv, ...env } };
  const kept = Object.entries(inheritedEnv).filter(([name]) => !isBlockedVariable(name));
  return {
    command,
    args: pinnedArgs(args, pin),
    env: { ...Object.fromEntries(kept), ...env, ...registryEnv(pin) },
  };
}

function pinnedArgs(args: readonly string[], pin: ConnectorPin): string[] {
  const first = args.findIndex((arg) => namesPackage(arg, pin));
  const exact =
    pin.registry === "npm" ? `${pin.package}@${pin.version}` : `${pin.package}==${pin.version}`;
  return args.map((arg, index) => (index === first ? exact : arg));
}

function namesPackage(arg: string, pin: ConnectorPin): boolean {
  if (pin.registry === "npm") {
    const at = arg.indexOf("@", arg.startsWith("@") ? 1 : 0);
    return (at === -1 ? arg : arg.slice(0, at)) === pin.package;
  }
  // The name runs up to the first character a PyPI name can't hold.
  const name = arg.replace(/[^A-Za-z0-9._-].*$/s, "");
  return pypiName(name) === pypiName(pin.package);
}

function pypiName(name: string): string {
  return name.toLowerCase().replaceAll(/[-_.]+/g, "-");
}

/** The registry setting for a pin: uv reads `UV_DEFAULT_INDEX`, pip and pipx `PIP_INDEX_URL`. */
function registryEnv(pin: ConnectorPin): Record<string, string> {
  const base = pin.registryUrl.replace(/\/+$/, "");
  if (pin.registry === "npm") return { npm_config_registry: base };
  return { UV_DEFAULT_INDEX: `${base}/simple`, PIP_INDEX_URL: `${base}/simple` };
}

/** The variables `app.package-runner-launch` refuses in a pinned connector's own `env`. */
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

function isBlockedVariable(name: string): boolean {
  const lower = name.toLowerCase();
  return blockedNames.has(lower) || blockedPrefixes.some((prefix) => lower.startsWith(prefix));
}
