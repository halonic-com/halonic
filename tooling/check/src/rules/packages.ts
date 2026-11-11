import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CheckContext, declaredDependencies, listInWords } from "../lib/context.ts";
import { coverageFloorProblems, testSetupProblems } from "../lib/coverage.ts";
import {
  adapterRuntimes,
  cliPackageName,
  folderNamePattern,
  isReservedCoreName,
  type Layer,
  reservedCoreNames,
  reservedCorePrefixes,
  scope,
} from "../lib/layout.ts";
import { Report } from "../lib/problems.ts";
import { namesTestFile, namesToolConfig } from "../lib/source-files.ts";
import type { WorkspacePackage } from "../lib/workspace.ts";

/**
 * Checks each package's `package.json`: its name follows from its folder
 * (a package staged for npm has its published name instead),
 * it is private unless listed as published, it declares its layer, owner
 * and coverage floor, its tests run through the shared Vitest preset with
 * coverage on, it exposes only public entry points, and every
 * internal dependency uses `workspace:*`.
 */
export function checkPackages(context: CheckContext): Report {
  const report = new Report("packages");
  const extraExports = readExtraExports(context, report);
  for (const pkg of context.packages) {
    checkIdentity(context, pkg, report);
    checkInternalVersions(context, pkg, report);
    if (pkg.directory !== ".") {
      checkExports(context, pkg, extraExports, report);
      checkCoverageFloor(context, pkg, report);
      checkMeasuredIn(context, pkg, report);
      checkTestSetup(context, pkg, report);
    }
  }
  checkCoreOrder(context, report);
  return report;
}

function checkIdentity(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  const file = pkg.manifestPath;
  const { name } = pkg.manifest;
  const place = context.placeOf(pkg);
  if (place === undefined) {
    report.error(
      file,
      "Packages live only in the folders listed in the table in docs/guides/checks.md. Move this one.",
    );
    return;
  }
  const folder = pkg.directory.split("/").at(-1) ?? "";
  const part = place.target?.name ?? folder;
  if (pkg.directory !== "." && !folderNamePattern.test(part)) {
    report.error(file, `Folder name "${part}" must be kebab-case, such as "schema-kit".`);
  }
  if (place.layer === "core" && isReservedCoreName(folder)) {
    report.error(
      file,
      `Core package folders may not be named ${reservedCoreNames.join(" or ")}, or start with ${reservedCorePrefixes.join(", ")}: those names belong to other layers.`,
    );
  }
  checkRuntime(pkg, place.layer, report);
  const publishedName = pkg.manifest.halonic?.publish?.name;
  if (publishedName !== undefined) {
    checkPublishedName(pkg, publishedName, report);
  } else if (name !== place.expectedName) {
    report.error(
      file,
      `The name must be "${place.expectedName}" (it follows from the folder), not "${name ?? "(missing)"}".`,
    );
  }
  checkPublication(context, pkg, report);
  checkDeclaration(pkg, place.layer, report);
}

/**
 * A package staged for npm has the name it is published under in the
 * workspace too, so nobody has to map one name onto the other. It stays in
 * our scope, and only listed packages may be staged (`checkPublication`).
 */
function checkPublishedName(pkg: WorkspacePackage, publishedName: string, report: Report): void {
  const file = pkg.manifestPath;
  const { name } = pkg.manifest;
  if (!publishedName.startsWith(`${scope}/`)) {
    report.error(
      file,
      `"halonic.publish.name" must be in the ${scope} scope, not "${publishedName}".`,
    );
  }
  if (name !== publishedName) {
    report.error(
      file,
      `The name must be "${publishedName}", the name it is published under ("halonic.publish.name"), not "${name ?? "(missing)"}".`,
    );
  }
}

function checkPublication(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  const file = pkg.manifestPath;
  const { name, halonic } = pkg.manifest;
  const published = name !== undefined && context.policy.published.includes(name);
  if (!published && pkg.manifest.private !== true) {
    report.error(
      file,
      `Add "private": true. Only the packages listed under "published" in ${context.policyPath} may be published.`,
    );
  }
  // A package staged for npm stays private in the workspace, so this is
  // where the list of what reaches npm is enforced for it.
  if (!published && halonic?.publish !== undefined) {
    report.error(
      file,
      `It has "halonic.publish", but only the packages listed under "published" in ${context.policyPath} may be published. Add it there or remove "halonic.publish".`,
    );
  }
}

/** The layer and owner the package declares for itself. */
function checkDeclaration(pkg: WorkspacePackage, layer: Layer, report: Report): void {
  const file = pkg.manifestPath;
  const { halonic } = pkg.manifest;
  if (halonic?.layer !== layer) {
    report.error(
      file,
      `Declare the layer: "halonic": { "layer": "${layer}" }. The folder puts this package in the ${layer} layer.`,
    );
  }
  if (typeof halonic?.owner !== "string" || halonic.owner.trim() === "") {
    report.error(file, `Name the owner who reviews changes: "halonic": { "owner": "<agent>" }.`);
  }
}

function checkCoverageFloor(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  const place = context.placeOf(pkg);
  if (place === undefined) {
    return;
  }
  for (const problem of coverageFloorProblems(pkg.manifest.halonic?.coverage, place.layer)) {
    report.error(pkg.manifestPath, problem);
  }
}

function checkTestSetup(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  for (const problem of testSetupProblemsOf(context, pkg)) {
    report.error(pkg.manifestPath, problem);
  }
}

function testSetupProblemsOf(context: CheckContext, pkg: WorkspacePackage): string[] {
  const configPath = join(context.root, pkg.directory, "vitest.config.ts");
  const configText = existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined;
  return testSetupProblems(pkg.manifest.scripts?.["test"], configText);
}

/**
 * A floor measured in another package's run is only real if that run
 * reaches this package's code and enforces floors. Otherwise it would
 * quietly measure nothing.
 */
function checkMeasuredIn(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  const coverage = pkg.manifest.halonic?.coverage as { measuredIn?: unknown } | undefined;
  const measuredIn = coverage?.measuredIn;
  if (typeof measuredIn !== "string" || measuredIn.trim() === "") {
    return;
  }
  const host = context.packages.find((candidate) => candidate.manifest.name === measuredIn);
  if (host === undefined || host === pkg || host.directory === ".") {
    report.error(
      pkg.manifestPath,
      `"halonic.coverage.measuredIn" names "${measuredIn}", which isn't another package in this repo.`,
    );
    return;
  }
  const dependsOnThis = declaredDependencies(host.manifest).some(
    (dependency) =>
      dependency.name === pkg.manifest.name &&
      (dependency.field === "dependencies" || dependency.field === "devDependencies"),
  );
  if (!dependsOnThis) {
    report.error(
      pkg.manifestPath,
      `${measuredIn} must list ${pkg.manifest.name ?? "this package"} in "dependencies" or "devDependencies", so its test run measures this package's src.`,
    );
  }
  if (testSetupProblemsOf(context, host).length > 0) {
    report.error(
      pkg.manifestPath,
      `${measuredIn} must run its tests through the shared preset ("vitest run" and definePackageTestConfig()), so this package's floor is enforced there.`,
    );
  }
}

/** Adapters say where they run; nothing else does, its folder already tells. */
function checkRuntime(pkg: WorkspacePackage, layer: Layer, report: Report): void {
  const runtime = pkg.manifest.halonic?.runtime;
  const choices = adapterRuntimes.map((choice) => `"${choice}"`).join(", ");
  if (layer !== "adapters") {
    if (runtime !== undefined) {
      report.error(
        pkg.manifestPath,
        `Only adapters declare "halonic": { "runtime" }. Remove it; this package's folder decides where it runs.`,
      );
    }
    return;
  }
  if (!(adapterRuntimes as readonly unknown[]).includes(runtime)) {
    report.error(
      pkg.manifestPath,
      `Declare where this adapter runs: "halonic": { "runtime": ${choices} }. Only "node" adapters may use Node APIs (plan 4.1).`,
    );
  }
}

function checkInternalVersions(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  for (const dependency of declaredDependencies(pkg.manifest)) {
    const internal =
      dependency.name.startsWith(`${scope}/`) ||
      dependency.name === cliPackageName ||
      context.packagesByName.has(dependency.name);
    if (!internal) {
      continue;
    }
    if (dependency.version !== "workspace:*") {
      report.error(
        pkg.manifestPath,
        `"${dependency.name}": "${dependency.version}" in ${dependency.field} must be "workspace:*". A version range lets pnpm look the name up on the registry, which is how dependency confusion happens. Add our own packages with "pnpm add ${dependency.name} --workspace", which writes "workspace:*".`,
      );
    }
    if (!context.packagesByName.has(dependency.name)) {
      report.error(
        pkg.manifestPath,
        `"${dependency.name}" is not a package in this workspace. Fix the name or create the package with "pnpm new".`,
      );
    }
  }
}

/**
 * Lists the keys of an `exports` field, or `undefined` when it is missing
 * or not a subpath map.
 */
export function exportKeys(exportsField: unknown): string[] | undefined {
  if (typeof exportsField === "string") {
    return ["."];
  }
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return undefined;
  }
  const keys = Object.keys(exportsField);
  return keys.every((key) => key.startsWith(".")) ? keys : ["."];
}

/**
 * Takes the policy's `extraExports` (its shape is checked when the policy is
 * read) and reports names that are not packages here. Apps and tooling
 * export what they like, so an entry for one only earns a warning.
 */
function readExtraExports(
  context: CheckContext,
  report: Report,
): ReadonlyMap<string, readonly string[]> {
  const extra = new Map<string, readonly string[]>();
  for (const [name, keys] of Object.entries(context.policy.extraExports)) {
    const pkg = context.packagesByName.get(name);
    if (pkg === undefined) {
      report.error(
        context.policyPath,
        `"extraExports" lists "${name}", which is not a package in this repo. Remove it.`,
      );
      continue;
    }
    const layer = context.placeOf(pkg)?.layer;
    if (layer === "apps" || layer === "tooling") {
      report.warning(
        context.policyPath,
        `"extraExports" lists "${name}", a package in ${layer}, whose exports aren't limited. Remove it.`,
      );
    }
    extra.set(name, keys);
  }
  return extra;
}

function checkExports(
  context: CheckContext,
  pkg: WorkspacePackage,
  extraExports: ReadonlyMap<string, readonly string[]>,
  report: Report,
): void {
  const place = context.placeOf(pkg);
  if (place === undefined || place.layer === "tooling" || place.layer === "apps") {
    return;
  }
  const keys = exportKeys(pkg.manifest.exports);
  const allowed = [
    ...(place.isFeature ? [".", "./api"] : ["."]),
    ...(extraExports.get(pkg.manifest.name ?? "") ?? []),
  ];
  if (keys === undefined) {
    report.error(
      pkg.manifestPath,
      `Add an "exports" map with ${listInWords(allowed.map((key) => `"${key}"`))}, so only the public entry points resolve.`,
    );
    return;
  }
  for (const key of keys) {
    if (!allowed.includes(key)) {
      report.error(
        pkg.manifestPath,
        `"exports" may only contain ${listInWords(allowed.map((key) => `"${key}"`))}. "${key}" would let other packages import internals. A deliberate extra entry point needs an "extraExports" entry in ${context.policyPath}.`,
      );
    }
  }
  if (place.isFeature && !keys.includes("./api")) {
    report.error(
      pkg.manifestPath,
      `A feature exports "./api": the services and types other features may use.`,
    );
  }
  checkExportTargets(context, pkg, report);
}

/**
 * Every `exports` target must exist and must be a source file: not a test
 * file and not a tool config file. Conditional targets are checked too.
 */
function checkExportTargets(context: CheckContext, pkg: WorkspacePackage, report: Report): void {
  for (const target of exportTargets(pkg.manifest.exports)) {
    if (!existsSync(join(context.root, pkg.directory, target))) {
      report.error(pkg.manifestPath, `"exports" points at ${target}, which doesn't exist.`);
    }
    if (namesTestFile(target)) {
      report.error(
        pkg.manifestPath,
        `"exports" points at the test file ${target}. Export source files only.`,
      );
    }
    // Config files are dev code and may import tests, so exporting one would let
    // shipped code in another package reach past the layers and process-starts checks.
    if (namesToolConfig(target)) {
      report.error(
        pkg.manifestPath,
        `"exports" points at the tool config file ${target}. Export source files only.`,
      );
    }
  }
}

/** Every file path in an `exports` value, through subpaths, conditions and fallback arrays. */
function exportTargets(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(exportTargets);
  }
  return [];
}

function checkCoreOrder(context: CheckContext, report: Report): void {
  const coreNames = context.packages
    .filter((pkg) => context.placeOf(pkg)?.layer === "core")
    .map((pkg) => pkg.manifest.name ?? pkg.directory);
  for (const name of coreNames) {
    if (!context.policy.coreOrder.includes(name)) {
      report.error(
        context.policyPath,
        `Core package "${name}" is missing from "coreOrder". Add it after every core package it uses.`,
      );
    }
  }
  for (const name of context.policy.coreOrder) {
    if (!coreNames.includes(name)) {
      report.error(
        context.policyPath,
        `"coreOrder" lists "${name}", which is not a core package. Remove it.`,
      );
    }
  }
  for (const name of context.policy.apiTypes) {
    if (!coreNames.includes(name)) {
      report.error(
        context.policyPath,
        `"apiTypes" lists "${name}", which is not a core package. API types packages are core packages; remove it or move the package into packages/core.`,
      );
    }
  }
}
