import { createHash } from "node:crypto";
import { dependencyFields, owningPackage, type WorkspacePackage } from "./workspace.ts";

/**
 * The cloud paths (ADR 5.9): a change here must pass the live suites against
 * the real Cloudflare test account before it merges. These are the direct
 * paths only. The live workflow and the code that decides and sweeps count
 * too, because nothing else runs them before a merge.
 */
export const cloudPathPatterns: readonly RegExp[] = [
  /^packages\/adapters\/cloudflare-[^/]+\//,
  /^packages\/adapters\/store-s3\//,
  /^packages\/targets\//,
  /^packages\/host\//,
  /^packages\/core\/ports\//,
  /^packages\/testing\/contracts\/(src\/)?target\//,
  /^apps\/cli\/src\/commands\/deploy\//,
  /^\.github\/workflows\/live-cloud\.yml$/,
  /^tooling\/check\/src\/(cli|lib)\/(cloud-affected|cloud-paths|live-sweep|live-resources)\.ts$/,
];

/** True when a repo-relative path is a cloud path. */
export function isCloudPath(file: string): boolean {
  return cloudPathPatterns.some((pattern) => pattern.test(file));
}

/** The changed files that are cloud paths, sorted. */
export function cloudAffectedFiles(changed: readonly string[]): string[] {
  return changed.filter(isCloudPath).sort();
}

/** What every live run installs and builds with, whatever package it tests. */
const workspaceSetupPaths: readonly string[] = [
  ".github/actions/setup",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];

/**
 * The folders and files a live result depends on: every package that holds a
 * cloud path, the workspace packages they depend on (transitively), the
 * workspace setup (root manifest, lockfile, workspace file, the CI setup
 * action) and the cloud paths outside packages. When none of these changed,
 * an earlier passing live run still holds.
 */
export function liveInputPaths(
  files: readonly string[],
  packages: readonly WorkspacePackage[],
): string[] {
  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  const inputs = new Set<string>(workspaceSetupPaths);
  const pending: WorkspacePackage[] = [];
  for (const file of files.filter(isCloudPath)) {
    const owner = owningPackage(file, packages);
    if (owner === undefined || owner.directory === ".") {
      inputs.add(file);
    } else {
      pending.push(owner);
    }
  }
  for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
    if (!inputs.has(entry.directory)) {
      inputs.add(entry.directory);
      pending.push(...workspaceDependencies(entry, byName));
    }
  }
  return [...inputs].sort();
}

/** The workspace packages a package depends on through `workspace:` ranges. */
function workspaceDependencies(
  entry: WorkspacePackage,
  byName: ReadonlyMap<string | undefined, WorkspacePackage>,
): WorkspacePackage[] {
  const dependencies: WorkspacePackage[] = [];
  for (const field of dependencyFields) {
    for (const [name, range] of Object.entries(entry.manifest[field] ?? {})) {
      const dependency = byName.get(name);
      if (dependency !== undefined && range.startsWith("workspace:")) {
        dependencies.push(dependency);
      }
    }
  }
  return dependencies;
}

/** A stable hash of `git ls-tree` lines (mode, type, object id, path) for the inputs. */
export function inputsHash(treeLines: readonly string[]): string {
  const sorted = [...treeLines].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex").slice(0, 32);
}
