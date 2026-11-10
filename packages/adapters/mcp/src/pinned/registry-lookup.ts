import type { PinnedPackage } from "@halonicjs/app";
import type { ConnectorPin, HttpClient } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";

/** How long a registry may take to answer before the launch is refused. */
export const registryTimeoutMs = 15_000;

/**
 * Asks the pin's registry, and only it, which package and version it lists
 * for the pinned version: npm's package document, or PyPI's JSON answer for
 * that one release. The answer's own name and version come back as they
 * are, so `checkResolvedVersion` can refuse a mirror that names another.
 *
 * @returns what the registry lists, or the reason to refuse the launch
 */
export async function lookUpPinnedPackage(
  pin: ConnectorPin,
  http: HttpClient,
): Promise<Result<PinnedPackage, string>> {
  const unlisted = `${pin.registryUrl} doesn't list ${pin.package} ${pin.version}`;
  let response: Response;
  try {
    response = await http.fetch(registryAddress(pin), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(registryTimeoutMs),
    });
  } catch {
    // The refusal says why in words; the network error itself names no more than that.
    return err(`${pin.registryUrl} can't be reached to look up ${pin.package} ${pin.version}`);
  }
  if (response.status === 404) return err(unlisted);
  if (!response.ok) {
    return err(
      `${pin.registryUrl} answered ${response.status} when asked for ${pin.package} ${pin.version}, so the version can't be checked`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err(`${pin.registryUrl} answered with something other than JSON for ${pin.package}`);
  }
  const listed = pin.registry === "npm" ? npmListed(body, pin.version) : pypiListed(body);
  return listed === undefined ? err(unlisted) : ok(listed);
}

/** Where the registry answers for the pinned package, under `registryUrl`. */
function registryAddress(pin: ConnectorPin): string {
  const base = pin.registryUrl.replace(/\/+$/, "");
  if (pin.registry === "npm") return `${base}/${pin.package.replace("/", "%2f")}`;
  return `${base}/pypi/${encodeURIComponent(pin.package)}/${encodeURIComponent(pin.version)}/json`;
}

/** The name and version an npm package document lists for `version`. */
function npmListed(body: unknown, version: string): PinnedPackage | undefined {
  const name = field(body, "name");
  const listed = field(field(field(body, "versions"), version), "version");
  return typeof name === "string" && typeof listed === "string"
    ? { package: name, version: listed }
    : undefined;
}

/** The name and version a PyPI answer for one release lists. */
function pypiListed(body: unknown): PinnedPackage | undefined {
  const info = field(body, "info");
  const name = field(info, "name");
  const version = field(info, "version");
  return typeof name === "string" && typeof version === "string"
    ? { package: name, version }
    : undefined;
}

/** One own field of a JSON value, or `undefined` for anything else. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, key)) return undefined;
  return (value as Record<string, unknown>)[key];
}
