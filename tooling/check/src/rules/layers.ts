import { builtinModules } from "node:module";
import { posix } from "node:path";
import {
  type ApprovedDependency,
  approvedDependency,
  type CheckContext,
  declaredDependencies,
  isAllowedIn,
  notAllowedMessage,
} from "../lib/context.ts";
import type { Layer } from "../lib/layout.ts";
import { Report } from "../lib/problems.ts";
import {
  isSourceFile,
  isTestFile,
  namesTestFile,
  splitBareSpecifier,
} from "../lib/source-files.ts";
import { owningPackage, type WorkspacePackage } from "../lib/workspace.ts";
import { apiTypesProblem, isApiTypes } from "./api-types.ts";
import { type EdgeKind, layerOf, layerProblem } from "./layer-table.ts";
import { exportKeys } from "./packages.ts";

const guide = "See docs/guides/dependencies.md.";

/**
 * Checks the layer table for every internal `package.json`
 * dependency and every import in source files. Also catches relative
 * imports that leave their package or reach a test file, Node built-ins
 * outside Node layers, imports of undeclared packages, deep imports past
 * `exports`, and code loading in core, host and Studio that the check
 * can't follow.
 */
export function checkLayers(context: CheckContext): Report {
  const report = new Report("layers");
  for (const pkg of context.packages) {
    for (const dependency of declaredDependencies(pkg.manifest)) {
      const target = context.packagesByName.get(dependency.name);
      if (target === undefined) {
        continue;
      }
      const kind: EdgeKind = dependency.field === "devDependencies" ? "dev" : "runtime";
      const problem = layerProblem(context, pkg, target, kind);
      if (problem !== undefined) {
        report.error(
          pkg.manifestPath,
          `${pkg.manifest.name} depends on ${dependency.name}: ${problem} ${guide}`,
        );
      }
    }
  }
  for (const file of context.files) {
    if (isSourceFile(file)) {
      checkImports(context, file, report);
    }
  }
  return report;
}

/**
 * True for code that may use dev tooling: test files, tool config files
 * in the package's own folder (such as `vitest.config.ts`), and every file
 * of a testing package.
 */
export function isDevFile(file: string, pkg: WorkspacePackage, layer: Layer | undefined): boolean {
  if (isTestFile(file) || layer === "testing") {
    return true;
  }
  const inPackage = pkg.directory === "." ? file : file.slice(pkg.directory.length + 1);
  return /^[^/]+\.config\.[cm]?[jt]s$/.test(inPackage);
}

/** The layers whose code must stay free of loads the check can't follow. */
const followedLayers: readonly (Layer | undefined)[] = ["core", "host", "studio"];

function checkImports(context: CheckContext, file: string, report: Report): void {
  const pkg = owningPackage(file, context.packages);
  if (pkg === undefined) {
    return;
  }
  const layer = layerOf(context, pkg);
  const dev = isDevFile(file, pkg, layer);
  const facts = context.sourceFacts(file);
  for (const reference of facts.imports) {
    const problem = importProblem(context, { file, pkg, layer, dev }, reference.specifier);
    if (problem !== undefined) {
      report.error(file, problem, reference.line);
    }
  }
  if (dev || !followedLayers.includes(layer)) {
    return;
  }
  for (const load of facts.hiddenLoads) {
    report.error(
      file,
      `${load.what} hides what this ${layer} code loads, so the layer check can't follow it. Use a static import of a declared package (plan 4.1).`,
      load.line,
    );
  }
}

interface ImportSite {
  readonly file: string;
  readonly pkg: WorkspacePackage;
  readonly layer: Layer | undefined;
  readonly dev: boolean;
}

function importProblem(
  context: CheckContext,
  site: ImportSite,
  specifier: string,
): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return relativeImportProblem(site, specifier);
  }
  if (specifier.startsWith("cloudflare:")) {
    return cloudflareProblem(context, site, specifier);
  }
  if (specifier.startsWith("node:") || builtinModules.includes(specifier)) {
    return builtinProblem(context, site, specifier);
  }
  const { name, subpath } = splitBareSpecifier(specifier);
  const target = context.packagesByName.get(name);
  const declared = declaredDependencies(site.pkg.manifest).find(
    (dependency) => dependency.name === name,
  );
  if (declared === undefined && target !== site.pkg) {
    return `imports "${name}", which ${site.pkg.manifestPath} doesn't declare. Add it to package.json (an external one also needs an entry in dependencies.json).`;
  }
  if (target === undefined) {
    return externalImportProblem(context, site, name);
  }
  const kind: EdgeKind = site.dev ? "dev" : "runtime";
  const layerIssue = layerProblem(context, site.pkg, target, kind);
  if (layerIssue !== undefined) {
    return `imports ${name}: ${layerIssue}`;
  }
  return subpathProblem(context, site, target, name, subpath);
}

function relativeImportProblem(site: ImportSite, specifier: string): string | undefined {
  if (specifier.startsWith("/")) {
    return `imports the absolute path "${specifier}". Use a relative path inside the package, or the other package's name.`;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(site.file), specifier));
  const inside = site.pkg.directory === "." || resolved.startsWith(`${site.pkg.directory}/`);
  if (!inside) {
    return `"${specifier}" reaches outside ${site.pkg.manifest.name}. Import the other package by name through its public entry point.`;
  }
  if (!site.dev && namesTestFile(resolved)) {
    return `"${specifier}" is a test file, and only tests may import tests. Move shared helpers into a non-test file or a testing package.`;
  }
  return undefined;
}

function builtinProblem(
  context: CheckContext,
  site: ImportSite,
  specifier: string,
): string | undefined {
  if (contractSuiteProblem(site)) {
    return `contract-suite files run on every target and may not use Node APIs ("${specifier}"). Put Node-only helpers in ${contractSuiteDirectory}/src/node/.`;
  }
  if (site.dev) {
    return undefined;
  }
  switch (site.layer) {
    case "core":
      return `core packages may not use Node APIs ("${specifier}"). Use a port, or move this code into an adapter.`;
    case "host":
      return `host packages are runtime-neutral and may use Web-standard APIs only, not Node APIs ("${specifier}"). Move this into targets/node/runtime or an adapter.`;
    case "studio":
      return `Studio packages run in the browser and may not use Node APIs ("${specifier}"). Go through studio/services.`;
    case "adapters": {
      const runtime = site.pkg.manifest.halonic?.runtime;
      return runtime === "node"
        ? undefined
        : `only adapters with "halonic": { "runtime": "node" } may use Node APIs ("${specifier}"); this one declares "${runtime ?? "(none)"}".`;
    }
    case "targets": {
      const target = context.placeOf(site.pkg)?.target;
      return target?.kind === "runtime" && target.name !== "node"
        ? `only the Node target's runtime may use Node APIs ("${specifier}"); the ${target.name} runtime uses its own platform's APIs.`
        : undefined;
    }
    default:
      return undefined;
  }
}

const contractSuiteDirectory = "packages/testing/contracts";

/**
 * True for a contract-suite `src/` file outside `src/node/`. Tool config files
 * in the package root never run on a target, so they stay allowed. Test files stay
 * exempt: they run in Node only, and the suite files they exercise do not.
 */
function contractSuiteProblem(site: ImportSite): boolean {
  return (
    site.pkg.directory === contractSuiteDirectory &&
    site.file.startsWith(`${contractSuiteDirectory}/src/`) &&
    !isTestFile(site.file) &&
    !site.file.startsWith(`${contractSuiteDirectory}/src/node/`)
  );
}

/**
 * `cloudflare:*` modules exist only in the Cloudflare runtime and in
 * `cloudflare-*` adapters that declare `"runtime": "workers"` or `"any"`.
 */
function cloudflareProblem(
  context: CheckContext,
  site: ImportSite,
  specifier: string,
): string | undefined {
  const place = context.placeOf(site.pkg);
  const folder = site.pkg.directory.split("/").at(-1) ?? "";
  const runtime = site.pkg.manifest.halonic?.runtime;
  const allowed =
    site.dev ||
    site.layer === "testing" ||
    (site.layer === "adapters" &&
      folder.startsWith("cloudflare-") &&
      (runtime === "workers" || runtime === "any")) ||
    (place?.target?.name === "cloudflare" && place.target.kind === "runtime");
  return allowed
    ? undefined
    : `"${specifier}" exists only on Cloudflare. Use it in targets/cloudflare/runtime, or in a cloudflare-* adapter that declares "runtime": "workers" or "any".`;
}

function externalImportProblem(
  context: CheckContext,
  site: ImportSite,
  name: string,
): string | undefined {
  const approved = approvedDependency(context, name);
  if (site.layer === "core" && !site.dev) {
    const packageName = site.pkg.manifest.name ?? site.pkg.directory;
    if (isApiTypes(context, packageName)) {
      return apiTypesProblem(context, packageName);
    }
    return coreExternalProblem(packageName, name, approved);
  }
  if (site.layer === "host" && !site.dev) {
    return `the host may not use third-party code ("${name}"). Move this code into an adapter or a target.`;
  }
  // Testing packages are test code themselves, such as testing/spec wrapping Vitest.
  const devLayer = site.layer === "tooling" || site.layer === "testing";
  if (approved?.category === "dev-tooling" && !site.dev && !devLayer) {
    return `"${name}" is dev tooling and may only be imported from tests and config files.`;
  }
  return undefined;
}

/**
 * Core uses no third-party code, except a core exception the user approved
 * for this exact package: today `zod` and `yaml`.
 */
function coreExternalProblem(
  packageName: string,
  name: string,
  approved: ApprovedDependency | undefined,
): string | undefined {
  if (approved?.category !== "core-exception") {
    return `core packages may not use third-party code ("${name}"). Write it in-house (core/std) or move this code into an adapter.`;
  }
  return isAllowedIn(approved, packageName)
    ? undefined
    : `${notAllowedMessage(packageName, name, approved)} ${guide}`;
}

function subpathProblem(
  context: CheckContext,
  site: ImportSite,
  target: WorkspacePackage,
  name: string,
  subpath: string,
): string | undefined {
  if (target === site.pkg) {
    return `imports its own package by name. Use a relative import inside a package.`;
  }
  const keys = exportKeys(target.manifest.exports) ?? ["."];
  const exported = keys.some((key) => key === subpath || matchesExportPattern(key, subpath));
  if (!exported) {
    return `"${name}${subpath === "." ? "" : subpath.slice(1)}" is not a public entry point of ${name}. Use one of: ${keys.join(", ")}.`;
  }
  const bothFeatures =
    context.placeOf(site.pkg)?.isFeature === true && context.placeOf(target)?.isFeature === true;
  if (bothFeatures && subpath !== "./api") {
    return `features use each other only through "${name}/api".`;
  }
  return undefined;
}

function matchesExportPattern(key: string, subpath: string): boolean {
  const star = key.indexOf("*");
  if (star === -1) {
    return false;
  }
  return subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1));
}
