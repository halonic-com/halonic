import {
  type DeployTarget,
  type DeployTargetContext,
  type DeployTargetEntry,
  deployTargetVersion,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { deployMessages } from "./messages/deploy.ts";
import { plainText } from "./messages/phrase.ts";
import { halonicVersion } from "./version.ts";

/** Imports a package by name; `import()` itself outside tests. */
export type ImportPackage = (name: string) => Promise<unknown>;

/** Every method a {@link DeployTarget} has, checked on what a target's `create` gives. */
const targetMethods = [
  "login",
  "plan",
  "deploy",
  "status",
  "rollback",
  "export",
  "import",
  "unlock",
  "revokeSessions",
  "destroy",
] as const satisfies readonly (keyof DeployTarget)[];

/**
 * A host as `deployments.yaml` names it: lowercase letters and digits, with
 * single hyphens between parts (`cloudflare`, `foo-bar`), so the package
 * name made from it is always a bare package name, never a path to a file.
 */
const hostPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * The package that deploys to `host`, such as
 * `@halonicjs/target-cloudflare-deploy` for "cloudflare".
 *
 * @throws KindedError `invalid_input` for a host that doesn't match `hostPattern`
 */
export function deployTargetPackage(host: string): string {
  if (!hostPattern.test(host)) {
    throw new KindedError("invalid_input", plainText(deployMessages.notAHost(host).phrase), {
      fix: plainText(deployMessages.notAHostFix().phrase),
    });
  }
  return `@halonicjs/target-${host}-deploy`;
}

/**
 * Loads the deploy target for a `deployments.yaml` host by name (ADR 5.6;
 * requirement `cli.deploy-target-loader`). The CLI never lists or imports a
 * target package (`check.cli-never-uses-deploy-targets`), so users install
 * only the targets they use: the name is computed, and the package's
 * `deployTarget` export is checked against the port before it's used.
 *
 * @throws KindedError `invalid_input` for a host that doesn't match `hostPattern`
 * @throws KindedError `not_found` when the package isn't installed
 * @throws KindedError `internal` when its `deployTarget` is missing, serves
 *   another host, was built for another port version or lacks a method
 *
 * @example
 * const target = await loadDeployTarget("cloudflare", { http, tokens, environmentToken, who });
 */
export async function loadDeployTarget(
  host: string,
  context: DeployTargetContext,
  importPackage: ImportPackage = (name) => import(name),
): Promise<DeployTarget> {
  const pkg = deployTargetPackage(host);
  let loaded: unknown;
  try {
    loaded = await importPackage(pkg);
  } catch (error) {
    if (!isMissing(error, pkg)) throw error;
    throw new KindedError(
      "not_found",
      plainText(deployMessages.targetMissing(hostName(host), pkg).phrase),
      {
        fix: plainText(deployMessages.targetMissingFix(pkg).phrase),
        cause: error,
      },
    );
  }
  const entry = entryOf(loaded);
  if (entry === undefined) throw unusable(pkg, "it has no deployTarget export");
  if (entry.host !== host) throw unusable(pkg, `its target serves ${entry.host}, not ${host}`);
  if (entry.version !== deployTargetVersion) {
    throw unusable(
      pkg,
      `it was built for deploy targets version ${entry.version}, not ${deployTargetVersion}`,
    );
  }
  const target: unknown = entry.create(context);
  const lacking = targetMethods.filter((method) => typeof field(target, method) !== "function");
  if (lacking.length > 0) throw unusable(pkg, `its target has no ${lacking.join(", ")}`);
  return target as DeployTarget;
}

/** "Cloudflare" for "cloudflare": the host as its dashboard and bill name it. */
function hostName(host: string): string {
  return host.charAt(0).toUpperCase() + host.slice(1);
}

function unusable(pkg: string, reason: string): KindedError {
  return new KindedError(
    "internal",
    plainText(deployMessages.targetUnusable(pkg, halonicVersion, reason).phrase),
    { fix: plainText(deployMessages.targetUnusableFix(pkg, halonicVersion).phrase) },
  );
}

/** The module's `deployTarget`, when it has the shape of a {@link DeployTargetEntry}. */
function entryOf(loaded: unknown): DeployTargetEntry | undefined {
  const entry = field(loaded, "deployTarget");
  return typeof field(entry, "host") === "string" &&
    typeof field(entry, "version") === "number" &&
    typeof field(entry, "create") === "function"
    ? (entry as DeployTargetEntry)
    : undefined;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[name]
    : undefined;
}

/**
 * Whether `import()` failed because `pkg` itself isn't installed, not because
 * something the package imports is missing: that's a broken install, and its
 * own error says more.
 */
function isMissing(error: unknown, pkg: string): boolean {
  const code = field(error, "code");
  const message = field(error, "message");
  return (
    (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
    typeof message === "string" &&
    message.includes(`'${pkg}'`)
  );
}
