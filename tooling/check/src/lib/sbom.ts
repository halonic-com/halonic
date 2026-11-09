/**
 * The release SBOM check and the third-party notices file. Pure functions:
 * `cli/sbom.ts` does the reading and writing.
 */
import type { DependencyList } from "./config-files.ts";

/** The parts of a CycloneDX component this check reads. */
export interface SbomComponent {
  readonly name: string;
  readonly version?: string;
  readonly group?: string;
  readonly purl?: string;
}

/** The parts of a CycloneDX document this check reads. */
export interface Sbom {
  readonly components?: readonly SbomComponent[];
}

/** One installed package with its licence, as `pnpm licenses list --long --json` reports it. */
export interface NoticeEntry {
  readonly name: string;
  readonly versions: readonly string[];
  readonly licence: string;
  readonly author?: string;
  readonly homepage?: string;
  /** The licence file text, when the package ships one. */
  readonly text?: string;
}

/** The full package name of a component: `@scope/name` or `name`. */
export function componentName(component: SbomComponent): string {
  return component.group === undefined || component.group === ""
    ? component.name
    : `${component.group}/${component.name}`;
}

/**
 * Lists every npm component of the SBOM that is neither one of our own
 * workspace packages nor on `tooling/check/dependencies.json`. Components
 * without an npm purl are reported too, so nothing slips past unnamed.
 */
export function findSbomProblems(
  sbom: Sbom,
  list: DependencyList,
  workspacePackages: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const component of sbom.components ?? []) {
    const name = componentName(component);
    const label = `${name}@${component.version ?? "?"}`;
    if (seen.has(label)) {
      continue;
    }
    seen.add(label);
    if (component.purl !== undefined && !component.purl.startsWith("pkg:npm/")) {
      problems.push(`${label} is not an npm package and cannot be matched to the dependency list`);
    } else if (!workspacePackages.has(name) && list.dependencies[name] === undefined) {
      problems.push(`${label} is in the SBOM but not in tooling/check/dependencies.json`);
    }
  }
  return problems;
}

const rule = "=".repeat(72);

/** Renders THIRD-PARTY-NOTICES.txt: one block per package, sorted, with its licence text. */
export function renderNotices(product: string, entries: readonly NoticeEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const blocks = sorted.map((entry) => {
    const lines = [`${entry.name} ${entry.versions.join(", ")}`, `Licence: ${entry.licence}`];
    if (entry.author !== undefined) {
      lines.push(`Author: ${entry.author}`);
    }
    if (entry.homepage !== undefined) {
      lines.push(`Homepage: ${entry.homepage}`);
    }
    lines.push("", entry.text?.trim() ?? "(This package ships no licence file. See its homepage.)");
    return lines.join("\n");
  });
  const header = `${product} includes the third-party software listed below.\n`;
  return `${[header, ...blocks].join(`\n${rule}\n\n`)}\n`;
}
