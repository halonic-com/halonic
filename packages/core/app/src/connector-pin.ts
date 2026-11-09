// Checks the exact package version a package-runner connector (`npx`, `uvx`
// and the others) is pinned to, as `app.connector-pin-version` asks. Pure:
// the launcher calls these, and does the registry lookup itself.

import type { ConnectorPin } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";

/** The registry a pin comes from: `npm` or `pypi`. */
export type PinRegistry = ConnectorPin["registry"];

/** A package at one exact version, as a command names it or a registry resolved it. */
export interface PinnedPackage {
  readonly package: string;
  readonly version: string;
}

/** How each registry writes a package name and an exact version. */
interface RegistryRules {
  /** A valid package name. */
  readonly name: RegExp;
  /** One exact version, in the form the registry lists it. */
  readonly exactVersion: RegExp;
  /** An exact version to show in a reason. */
  readonly exampleVersion: string;
  /** The name two spellings of one package share. */
  readonly sameName: (name: string) => string;
}

// A number without leading zeros, as both registries list them.
const number = "(?:0|[1-9]\\d*)";
// A semver prerelease part, such as `beta` or `0`.
const prereleasePart = `(?:${number}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;

const rules: Record<PinRegistry, RegistryRules> = {
  npm: {
    // The rule npm uses for new packages: lowercase, URL-safe, optional scope.
    name: /^(?:@[a-z0-9-][a-z0-9._~-]*\/)?[a-z0-9-][a-z0-9._~-]*$/,
    // Semver: three numbers and an optional prerelease. Build metadata
    // (`+…`) is left out, because the registry doesn't keep it.
    exactVersion: new RegExp(
      `^${number}\\.${number}\\.${number}(?:-${prereleasePart}(?:\\.${prereleasePart})*)?$`,
    ),
    exampleVersion: "2.3.1",
    sameName: (name) => name,
  },
  pypi: {
    name: /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/,
    // A PEP 440 public version in its normal form: an optional epoch,
    // release numbers, then an optional `a`, `b` or `rc`, `.post` and `.dev`.
    exactVersion: new RegExp(
      `^(?:[1-9]\\d*!)?${number}(?:\\.${number})*(?:(?:a|b|rc)${number})?` +
        `(?:\\.post${number})?(?:\\.dev${number})?$`,
    ),
    exampleVersion: "2.3.1",
    // PyPI treats runs of `-`, `_` and `.` alike and ignores case (PEP 503).
    sameName: (name) => name.toLowerCase().replace(/[-_.]+/g, "-"),
  },
};

/**
 * Checks a stored pin: its package name must be valid for its registry, and
 * its version one exact version, never a tag or a range.
 *
 * @example
 * checkPinVersion({ registry: "npm", registryUrl, package: "@acme/mail-mcp", version: "latest" });
 * // err('the version "latest" is a tag, …')
 */
export function checkPinVersion(pin: ConnectorPin): Result<ConnectorPin, string> {
  if (pin.registry !== "npm" && pin.registry !== "pypi") {
    return err(`the registry "${String(pin.registry)}" isn't npm or pypi`);
  }
  const named = checkPackageName(pin.registry, pin.package);
  if (!named.ok) {
    return named;
  }
  const exact = checkExactVersion(pin.registry, pin.version);
  if (!exact.ok) {
    return exact;
  }
  return ok(pin);
}

/**
 * Compares what the registry resolved with the pin. Any other package or any other version is refused, even a newer one.
 * PyPI names are compared the way PyPI compares them, so `Mail_MCP` is
 * `mail-mcp`; npm names and all versions must match exactly.
 *
 * @example
 * checkResolvedVersion(pin, { package: "@acme/mail-mcp", version: "2.3.2" });
 * // err('the registry resolved @acme/mail-mcp 2.3.2, but the pin is 2.3.1')
 */
export function checkResolvedVersion(
  pin: ConnectorPin,
  resolved: PinnedPackage,
): Result<PinnedPackage, string> {
  const pinned = checkPinVersion(pin);
  if (!pinned.ok) {
    return pinned;
  }
  if (!isSamePackage(pin.registry, resolved.package, pin.package)) {
    return err(
      `the registry resolved the package "${resolved.package}", but the pin is for "${pin.package}"`,
    );
  }
  if (resolved.version !== pin.version) {
    return err(
      `the registry resolved ${pin.package} ${resolved.version}, but the pin is ${pin.version}`,
    );
  }
  return ok(resolved);
}

/**
 * Whether two names are one package in a registry. PyPI compares them the
 * way PyPI does, so `Mail_MCP` is `mail-mcp`; npm names must match exactly.
 */
export function isSamePackage(registry: PinRegistry, first: string, second: string): boolean {
  const { sameName } = rules[registry];
  return sameName(first) === sameName(second);
}

/** Refuses a name the registry wouldn't accept. */
export function checkPackageName(registry: PinRegistry, name: string): Result<string, string> {
  if (!rules[registry].name.test(name)) {
    return err(`"${name}" isn't a valid ${registry} package name`);
  }
  return ok(name);
}

/** Refuses a version that isn't one exact version, saying whether it is a tag or a range. */
export function checkExactVersion(registry: PinRegistry, version: string): Result<string, string> {
  const { exactVersion, exampleVersion } = rules[registry];
  if (exactVersion.test(version)) {
    return ok(version);
  }
  return err(
    `the version "${version}" ${whyNotExact(version)}; pin an exact version, such as ${exampleVersion}`,
  );
}

function whyNotExact(version: string): string {
  if (isTag(version)) {
    return "is a tag, which can move to another version";
  }
  if (isRange(version)) {
    return "is a range, which can match more than one version";
  }
  return "isn't one exact version as the registry lists it";
}

/** A word such as `latest`, `next` or `beta`, but not a range letter like `x` or a `v1.2.3`. */
function isTag(version: string): boolean {
  return /^[A-Za-z][A-Za-z0-9._-]*$/.test(version) && !/^(?:[xX]|v\d.*)$/.test(version);
}

/** Range operators, wildcards, lists, or only part of a version (`1`, `1.2`). */
function isRange(version: string): boolean {
  return /[\^~<>=!*|,\s]|(?:^|\.)[xX](?:\.|$)/.test(version) || /^\d+(?:\.\d+)?$/.test(version);
}
