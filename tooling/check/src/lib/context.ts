import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApprovedDependency,
  type DependencyList,
  type Policy,
  parseDependencyList,
  parsePolicy,
} from "./config-files.ts";
import { type PackagePlace, placeOf } from "./layout.ts";
import { isSourceFile, readSourceFacts, type SourceFacts } from "./source-files.ts";
import {
  type DependencyField,
  dependencyFields,
  listRepoFiles,
  listWorkspacePackages,
  type PackageJson,
  readJson,
  type WorkspacePackage,
} from "./workspace.ts";

export type {
  ApprovedDependency,
  DependencyCategory,
  DependencyList,
  Policy,
} from "./config-files.ts";

/** Everything the rules look at, read once per run. */
export interface CheckContext {
  readonly root: string;
  readonly files: readonly string[];
  readonly packages: readonly WorkspacePackage[];
  readonly packagesByName: ReadonlyMap<string, WorkspacePackage>;
  readonly policy: Policy;
  readonly dependencyList: DependencyList;
  readonly policyPath: string;
  readonly dependencyListPath: string;
  /** The layer and expected name of a package, from its folder. */
  placeOf(pkg: WorkspacePackage): PackagePlace | undefined;
  /** The text of a repo file, read once. */
  read(file: string): string;
  /** The imports and functions of a source file, parsed once. */
  sourceFacts(file: string): SourceFacts;
}

/** Reads the repo once and returns the context every rule shares. */
export function loadContext(root: string): CheckContext {
  const policyPath = "tooling/check/policy.json";
  const dependencyListPath = "tooling/check/dependencies.json";
  const packages = listWorkspacePackages(root);
  const packagesByName = new Map<string, WorkspacePackage>();
  for (const pkg of packages) {
    if (pkg.manifest.name !== undefined) {
      packagesByName.set(pkg.manifest.name, pkg);
    }
  }
  const texts = new Map<string, string>();
  const facts = new Map<string, SourceFacts>();
  const read = (file: string): string => {
    let text = texts.get(file);
    if (text === undefined) {
      text = readFileSync(join(root, file), "utf8");
      texts.set(file, text);
    }
    return text;
  };
  return {
    root,
    files: listRepoFiles(root),
    packages,
    packagesByName,
    policy: parsePolicy(policyPath, readJson(join(root, policyPath))),
    dependencyList: parseDependencyList(
      dependencyListPath,
      readJson(join(root, dependencyListPath)),
    ),
    policyPath,
    dependencyListPath,
    placeOf: (pkg) => placeOf(pkg.directory),
    read,
    sourceFacts(file) {
      if (!isSourceFile(file)) {
        return { imports: [], hiddenLoads: [], functions: [] };
      }
      let found = facts.get(file);
      if (found === undefined) {
        found = readSourceFacts(file, read(file));
        facts.set(file, found);
      }
      return found;
    },
  };
}

/** The `dependencies.json` entry for a package name; never an inherited object key such as `toString`. */
export function approvedDependency(
  context: CheckContext,
  name: string,
): ApprovedDependency | undefined {
  const { dependencies } = context.dependencyList;
  return Object.hasOwn(dependencies, name) ? dependencies[name] : undefined;
}

/** True when a package name matches an `allowedIn` pattern, where `*` matches any text. */
export function matchesNamePattern(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

/** True when an approved dependency may be used in this package. */
export function isAllowedIn(approved: ApprovedDependency, packageName: string): boolean {
  return approved.allowedIn.some((pattern) => matchesNamePattern(packageName, pattern));
}

/**
 * Explains that a package uses an approved library outside its allowed
 * packages, and what to use instead.
 *
 * @example
 * notAllowedMessage("@halonicjs/workflow", "zod", zodEntry);
 * // '@halonicjs/workflow uses "zod". "zod" is allowed only in @halonicjs/schema-kit
 * //  and @halonicjs/format. Use @halonicjs/schema-kit for validation, or move this
 * //  code into an adapter.'
 */
export function notAllowedMessage(
  packageName: string,
  dependencyName: string,
  approved: ApprovedDependency,
): string {
  const places = listInWords(approved.allowedIn);
  let message = `${packageName} uses "${dependencyName}". "${dependencyName}" is allowed only in ${places}.`;
  if (approved.useInstead !== undefined) {
    const orAdapter =
      approved.category === "core-exception" ? ", or move this code into an adapter" : "";
    message += ` Use ${approved.useInstead}${orAdapter}.`;
  }
  return message;
}

/** "a", "a and b", "a, b and c". */
export function listInWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** All dependencies a manifest declares, with the field each one is in. */
export function declaredDependencies(
  manifest: PackageJson,
): { name: string; version: string; field: DependencyField }[] {
  const result: { name: string; version: string; field: DependencyField }[] = [];
  for (const field of dependencyFields) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      result.push({ name, version, field });
    }
  }
  return result;
}
