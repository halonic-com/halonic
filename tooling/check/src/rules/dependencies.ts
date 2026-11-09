import { type CatalogEntry, plainVersion, readWorkspaceVersions } from "../lib/catalog.ts";
import type { ApprovedDependency } from "../lib/config-files.ts";
import {
  approvedDependency,
  type CheckContext,
  declaredDependencies,
  isAllowedIn,
  notAllowedMessage,
} from "../lib/context.ts";
import type { Layer } from "../lib/layout.ts";
import { overrideProblems, readAllowedOverrides } from "../lib/overrides.ts";
import { Report } from "../lib/problems.ts";
import type { DependencyField, WorkspacePackage } from "../lib/workspace.ts";

const guide = "See docs/guides/dependencies.md.";
const cloudRuntimeCategories = new Set(["core-exception", "outside-world"]);
const workspaceFile = "pnpm-workspace.yaml";
export const overridesAllowedPath = "tooling/check/overrides-allowed.json";

/** `package.json` fields that rewrite the dependency tree, like `overrides:` in the workspace file. */
const manifestTreeRewrites = ["overrides", "resolutions", "pnpm"];

interface ExternalDependency {
  readonly name: string;
  readonly version: string;
  readonly field: DependencyField;
}

/**
 * Checks every external dependency against `dependencies.json`: it must be listed, used only in its allowed packages
 * and layers, take a plain version from the catalog, and dev tooling stays in devDependencies. Testing packages may also
 * list dev tooling they wrap as a peerDependency, because the package using them brings it. Nothing may rewrite the
 * tree around the catalog.
 */
export function checkDependencies(context: CheckContext): Report {
  const report = new Report("dependencies");
  const used = new Set<string>();
  for (const pkg of context.packages) {
    for (const field of manifestTreeRewrites) {
      if (Object.hasOwn(pkg.manifest, field)) {
        report.error(
          pkg.manifestPath,
          `"${field}" rewrites the dependency tree around the catalog and dependencies.json. Remove it; versions live in the catalog. ${guide}`,
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
  if (!isAllowedIn(approved, packageName)) {
    report.error(
      pkg.manifestPath,
      `${notAllowedMessage(packageName, dependency.name, approved)} ${guide}`,
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
      `"${dependency.name}": "${dependency.version}" must be "catalog:". Put the version once in the catalog in pnpm-workspace.yaml.`,
    );
  }
  if (approved.category === "dev-tooling" && !isDevField(context, pkg, dependency.field)) {
    report.error(
      pkg.manifestPath,
      `"${dependency.name}" is dev tooling and belongs in devDependencies; it must never ship.`,
    );
  }
}

/** Where dev tooling may be listed: devDependencies, or peerDependencies in a testing package. */
function isDevField(context: CheckContext, pkg: WorkspacePackage, field: DependencyField): boolean {
  if (field === "devDependencies") {
    return true;
  }
  return field === "peerDependencies" && context.placeOf(pkg)?.layer === "testing";
}

/** Where each category may live; `undefined` when the entry fits its category. */
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
    case "core-exception":
      return entry.layers.length === 1 && entry.layers[0] === "core"
        ? undefined
        : `is a core exception, which may be used only in the core layer.`;
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
    if (entry.category === "core-exception" && entry.allowedIn.some((p) => p.includes("*"))) {
      report.error(
        context.dependencyListPath,
        `"${name}" is a core exception, so it names each core package exactly; "*" isn't allowed. Each one needs the user's approval.`,
      );
    }
    if (entry.cloudRuntime === true && !cloudRuntimeCategories.has(entry.category)) {
      report.error(
        context.dependencyListPath,
        `"${name}" is ${entry.category}, so it can't be marked cloudRuntime. Only core exceptions and outside-world libraries may ship in a cloud runtime, with the user's approval.`,
      );
    }
    if (entry.reason.trim() === "") {
      report.error(context.dependencyListPath, `"${name}" needs a reason.`);
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
 * name, and no setting rewrites the tree around the catalog.
 */
function checkWorkspaceVersions(context: CheckContext, report: Report): void {
  const { catalog, overrides, treeRewrites, unreadableLines } = readWorkspaceVersions(
    context.read(workspaceFile),
  );
  for (const line of unreadableLines) {
    report.error(
      workspaceFile,
      `The check can't read this line. Write top-level settings as "name:" with no space before the colon, and one "name: version" per catalog line, indented by two spaces.`,
      line,
    );
  }
  for (const entry of catalog) {
    if (!plainVersion.test(entry.version)) {
      report.error(
        workspaceFile,
        `"${entry.name}: ${entry.version}" must be a plain version such as 1.2.3, ^1.2.3 or ~1.2.3. Aliases, URLs, tags and other protocols could install a different package.`,
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
      `"${setting}" rewrites the dependency tree around the catalog and dependencies.json, so it isn't allowed. If a security fix needs one, propose an allow-list for this check in its own pull request.`,
      line,
    );
  }
  checkOverrides(context, catalog, overrides, report);
}

/** `overrides:` pass only as a parent-scoped selector in `overrides-allowed.json`, at the catalog version. */
function checkOverrides(
  context: CheckContext,
  catalog: readonly CatalogEntry[],
  overrides: readonly CatalogEntry[],
  report: Report,
): void {
  if (!context.files.includes(overridesAllowedPath)) {
    report.error(
      overridesAllowedPath,
      `The file is missing. Keep it, with an empty list when nothing is allowed. ${guide}`,
    );
    return;
  }
  const reading = readAllowedOverrides(context.read(overridesAllowedPath));
  for (const problem of reading.problems) {
    report.error(overridesAllowedPath, `${problem}. ${guide}`);
  }
  const found = overrideProblems(overrides, reading.entries, catalog);
  for (const { message, line } of found.problems) {
    report.error(workspaceFile, message, line);
  }
  for (const message of found.stale) {
    report.error(overridesAllowedPath, `${message} ${guide}`);
  }
}
