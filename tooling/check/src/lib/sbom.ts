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
  readonly type?: string;
  readonly "bom-ref"?: string;
}

/** The parts of a CycloneDX document this check reads. */
export interface Sbom {
  readonly metadata?: { readonly component?: SbomComponent } & Readonly<Record<string, unknown>>;
  readonly components?: readonly SbomComponent[];
  readonly dependencies?: readonly SbomDependency[];
}

/** One entry of the CycloneDX dependency graph. */
export interface SbomDependency {
  readonly ref: string;
  readonly dependsOn?: readonly string[];
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
 * Lists every npm component of the SBOM that is neither approved nor pulled in
 * by an approved one. A component is approved when it is one of our own
 * workspace packages or is on `tooling/check/dependencies.json`. Transitive
 * packages are accepted when the CycloneDX dependency graph reaches them from
 * an approved component, so the list only names what we choose to depend on.
 * Components without an npm purl are reported too, so nothing slips past
 * unnamed.
 */
export function findSbomProblems(
  sbom: Sbom,
  list: DependencyList,
  workspacePackages: ReadonlySet<string>,
): string[] {
  const components = sbom.components ?? [];
  const refOf = (component: SbomComponent): string =>
    component["bom-ref"] ?? component.purl ?? `${componentName(component)}@${component.version}`;
  const isApproved = (component: SbomComponent): boolean => {
    const name = componentName(component);
    return workspacePackages.has(name) || list.dependencies[name] !== undefined;
  };
  const edges = new Map(
    (sbom.dependencies ?? []).map((entry) => [entry.ref, entry.dependsOn ?? []] as const),
  );
  const reached = new Set<string>();
  const queue = components.filter(isApproved).map(refOf);
  for (let ref = queue.pop(); ref !== undefined; ref = queue.pop()) {
    if (!reached.has(ref)) {
      reached.add(ref);
      queue.push(...(edges.get(ref) ?? []));
    }
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const component of components) {
    const name = componentName(component);
    const label = `${name}@${component.version ?? "?"}`;
    if (seen.has(label)) {
      continue;
    }
    seen.add(label);
    if (component.purl !== undefined && !component.purl.startsWith("pkg:npm/")) {
      problems.push(`${label} is not an npm package and cannot be matched to the dependency list`);
    } else if (!reached.has(refOf(component))) {
      problems.push(
        `${label} is in the SBOM but not in tooling/check/dependencies.json, and no listed package depends on it`,
      );
    }
  }
  return problems;
}

/**
 * Names the product the SBOM describes. `pnpm sbom` takes the name and version
 * from the root package (`@halonicjs/root@0.0.0`), which is wrong for a
 * release file, so `metadata.component` is replaced with an application and the
 * dependency graph is pointed at it.
 */
export function withProduct(sbom: Sbom, name: string, version: string): Sbom {
  const ref = `${name}@${version}`;
  const oldRef = sbom.metadata?.component?.["bom-ref"];
  const rename = (value: string): string => (value === oldRef ? ref : value);
  return {
    ...sbom,
    metadata: {
      ...sbom.metadata,
      component: { type: "application", name, version, "bom-ref": ref },
    },
    // The dependency graph still points at the old root, so it follows the rename.
    ...(sbom.dependencies === undefined
      ? {}
      : {
          dependencies: sbom.dependencies.map((entry) => ({
            ...entry,
            ref: rename(entry.ref),
            ...(entry.dependsOn === undefined ? {} : { dependsOn: entry.dependsOn.map(rename) }),
          })),
        }),
  };
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
