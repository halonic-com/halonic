import { join } from "node:path";
import type { BundleRules } from "./bundle.ts";
import type { DependencyList, Policy } from "./context.ts";
import { listWorkspacePackages, readJson } from "./workspace.ts";

/** The npm package of a published import path: `@scope/name/subpath` gives `@scope/name`. */
function layerPackageOf(publishedName: string | undefined): string | undefined {
  return publishedName?.split("/").slice(0, 2).join("/");
}

/**
 * Reads what the bundle check compares a cloud runtime bundle against, from
 * `policy.json`, `dependencies.json` and the workspace packages.
 *
 * @param root - the repo root
 * @param target - the cloud provider, a key of `cloudRuntimes` in `policy.json`, e.g. `cloudflare`
 * @returns the rules, or `undefined` when `policy.json` has no runtime for `target`
 */
export function loadBundleRules(root: string, target: string): BundleRules | undefined {
  const policy = readJson<Policy>(join(root, "tooling/check/policy.json"));
  const runtime = policy.cloudRuntimes[target];
  if (runtime === undefined) {
    return undefined;
  }
  return {
    target,
    runtime,
    dependencyList: readJson<DependencyList>(join(root, "tooling/check/dependencies.json")),
    // Our own code under its workspace name or, installed from npm, under
    // the layer package it is published in (`@halonicjs/adapters` for
    // `@halonicjs/adapters/integration-kit`).
    workspacePackages: new Set(
      listWorkspacePackages(root).flatMap((pkg) =>
        [pkg.manifest.name, layerPackageOf(pkg.manifest.halonic?.publish?.name)].filter(
          (name): name is string => name !== undefined,
        ),
      ),
    ),
  };
}
