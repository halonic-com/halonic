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
