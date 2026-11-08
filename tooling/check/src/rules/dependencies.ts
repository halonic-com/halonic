import { plainVersion, readWorkspaceVersions } from "../lib/catalog.ts";
import type { ApprovedDependency } from "../lib/config-files.ts";
import {
  approvedDependency,
  type CheckContext,
  declaredDependencies,
  matchesNamePattern,
} from "../lib/context.ts";
import type { Layer } from "../lib/layout.ts";
import { Report } from "../lib/problems.ts";
import type { DependencyField, WorkspacePackage } from "../lib/workspace.ts";

const guide = "See docs/guides/dependencies.md.";
const workspaceFile = "pnpm-workspace.yaml";

/** `package.json` fields that rewrite the dependency tree, like `overrides:` in the workspace file. */
const manifestTreeRewrites = ["overrides", "resolutions", "pnpm"];

interface ExternalDependency {
  readonly name: string;
  readonly version: string;
  readonly field: DependencyField;
}

/**
 * Checks every external dependency against `dependencies.json` (plan 7.1
 * and 7.4): it must be listed, used only in its allowed packages and
 * layers, take a plain version from the catalog, and dev tooling stays in
 * devDependencies. Nothing may rewrite the tree around the catalog.
 */
export function checkDependencies(context: CheckContext): Report {
  const report = new Report("dependencies");
  const used = new Set<string>();
  for (const pkg of context.packages) {
    for (const field of manifestTreeRewrites) {
      if (Object.hasOwn(pkg.manifest, field)) {
        report.error(
          pkg.manifestPath,
          `"${field}" rewrites the dependency tree around the catalog and dependencies.json. Remove it; versions live in the catalog (plan 7.4). ${guide}`,
        );
      }
    }
    for (const dependency of declaredDependencies(pkg.manifest)) {
      const internal =
        context.packagesByName.has(dependency.name) || dependency.version.startsWith("workspace:");
      if (!internal) {
        used.add(dependency.name);
        checkOne(context, pkg, dependency, report);
      }
    }
  }
  checkList(context, used, report);
  checkWorkspaceVersions(context, report);
  return report;
}

function checkOne(
  context: CheckContext,
  pkg: WorkspacePackage,
  dependency: ExternalDependency,
  report: Report,
): void {
  const packageName = pkg.manifest.name ?? pkg.directory;
  const approved = approvedDependency(context, dependency.name);
  if (approved === undefined) {
    report.error(
      pkg.manifestPath,
      `"${dependency.name}" isn't in ${context.dependencyListPath}. Adding a dependency is a decision: add an entry with category, allowedIn and reason, and get Liam's approval in the pull request. ${guide}`,
    );
    return;
  }
  if (!approved.allowedIn.some((pattern) => matchesNamePattern(packageName, pattern))) {
    report.error(
      pkg.manifestPath,
      `"${dependency.name}" is approved only for ${approved.allowedIn.join(", ")}, not ${packageName}. ${guide}`,
    );
  }
  const layer = context.placeOf(pkg)?.layer;
  if (layer !== undefined && !approved.layers.includes(layer)) {
    report.error(
      pkg.manifestPath,
      `"${dependency.name}" is approved only in the ${approved.layers.join(", ")} layers, not in ${layer}. ${guide}`,
    );
  }
  if (dependency.version !== "catalog:") {
    report.error(
      pkg.manifestPath,
      `"${dependency.name}": "${dependency.version}" must be "catalog:". Put the version once in the catalog in pnpm-workspace.yaml (plan 7.4).`,
    );
  }
  if (approved.category === "dev-tooling" && dependency.field !== "devDependencies") {
    report.error(
      pkg.manifestPath,
      `"${dependency.name}" is dev tooling and belongs in devDependencies; it must never ship (plan 7.1).`,
    );
  }
}

/** Where each category may live (plan 7.1); `undefined` when the entry fits its category. */
export function categoryProblem(entry: ApprovedDependency): string | undefined {
  switch (entry.category) {
    case "outside-world": {
      const [only] = entry.allowedIn;
      const oneAdapter =
        entry.allowedIn.length === 1 &&
        only?.startsWith("@halonicjs/adapter-") === true &&
        !only.includes("*") &&
        entry.layers.length === 1 &&
        entry.layers[0] === "adapters";
      return oneAdapter
        ? undefined
        : `is outside-world code, which lives in exactly one adapter: allowedIn names one "@halonicjs/adapter-<name>" (no *) and layers is ["adapters"].`;
    }
    case "studio-framework": {
      const studioLayers: readonly Layer[] = ["studio", "apps"];
      return entry.layers.every((layer) => studioLayers.includes(layer))
        ? undefined
        : `is a Studio framework, which may be used only in the studio and apps layers.`;
    }
    case "dev-tooling":
      return undefined;
  }
}

function checkList(context: CheckContext, used: ReadonlySet<string>, report: Report): void {
  for (const [name, entry] of Object.entries(context.dependencyList.dependencies)) {
    const problem = categoryProblem(entry);
    if (problem !== undefined) {
      report.error(context.dependencyListPath, `"${name}" ${problem} ${guide}`);
    }
    if (!used.has(name)) {
      report.warning(
        context.dependencyListPath,
        `"${name}" is listed but no package uses it. Remove the entry if it's no longer needed.`,
      );
    }
  }
}

/**
 * Every catalog version is a plain semver version or range, so an alias
 * such as `npm:other@1` can't swap in another package under an approved
 * name, and no setting rewrites the tree around the catalog (plan 7.4).
 */
function checkWorkspaceVersions(context: CheckContext, report: Report): void {
  const { catalog, treeRewrites, unreadableLines } = readWorkspaceVersions(
    context.read(workspaceFile),
  );
  for (const line of unreadableLines) {
    report.error(
      workspaceFile,
      `The check can't read this line of "catalog:". Write one "name: version" per line, indented by two spaces.`,
      line,
    );
  }
  for (const entry of catalog) {
    if (!plainVersion.test(entry.version)) {
      report.error(
        workspaceFile,
        `"${entry.name}: ${entry.version}" must be a plain version such as 1.2.3, ^1.2.3 or ~1.2.3. Aliases, URLs, tags and other protocols could install a different package (plan 7.4).`,
        entry.line,
      );
    }
    if (!Object.hasOwn(context.dependencyList.dependencies, entry.name)) {
      report.error(
        workspaceFile,
        `"${entry.name}" is in the catalog but not in ${context.dependencyListPath}. ${guide}`,
        entry.line,
      );
    }
  }
  for (const { setting, line } of treeRewrites) {
    report.error(
      workspaceFile,
      `"${setting}" rewrites the dependency tree around the catalog and dependencies.json, so it isn't allowed. If a security fix needs one, propose an allow-list for this check in its own pull request (plan 7.4).`,
      line,
    );
  }
}
