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

/** One package or vendored file with its licence, for THIRD-PARTY-NOTICES.txt. */
export interface NoticeEntry {
  readonly name: string;
  /** Empty for a vendored file. */
  readonly versions: readonly string[];
  readonly licence: string;
  readonly author?: string;
  readonly homepage?: string;
  /** Where a vendored file was copied from. */
  readonly source?: string;
  /** The text of each licence file the package ships, in file name order; empty when it ships none. */
  readonly texts: readonly string[];
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

/** One part of THIRD-PARTY-NOTICES.txt: the npm packages, the Rust crates or the vendored files. */
export interface NoticeSection {
  readonly title: string;
  readonly entries: readonly NoticeEntry[];
}

/** Code-point order, so a file comes out the same whatever the machine's locale. */
export function byCodePoint(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** One package's block: its name, licence and details, then each licence text or a pointer to it. */
function noticeBlock(entry: NoticeEntry, printed: Map<string, string>): string {
  const label = [
    entry.name,
    ...(entry.versions.length > 0 ? [entry.versions.join(", ")] : []),
  ].join(" ");
  const lines = [label, `Licence: ${entry.licence}`];
  if (entry.author !== undefined) {
    lines.push(`Author: ${entry.author}`);
  }
  if (entry.homepage !== undefined) {
    lines.push(`Homepage: ${entry.homepage}`);
  }
  if (entry.source !== undefined) {
    lines.push(`Source: ${entry.source}`);
  }
  if (entry.texts.length === 0) {
    lines.push("", "(This package ships no licence file. See its homepage.)");
  }
  for (const raw of entry.texts) {
    const text = raw.replaceAll("\r\n", "\n").trim();
    const first = printed.get(text);
    if (first === undefined) {
      printed.set(text, label);
    }
    lines.push("", first === undefined ? text : `Same licence text as ${first} above.`);
  }
  return lines.join("\n");
}

/**
 * Renders THIRD-PARTY-NOTICES.txt: the sections in the order given, each with
 * one block per package, sorted by name and version, with its licence texts.
 * A text that is the same as one printed above (line endings aside) is not
 * repeated: the block names the package it is printed under. Most crates ship
 * the same Apache-2.0 file next to their own MIT one, so each file is compared
 * on its own. The fixed order keeps the pointers, and the whole file, the
 * same on every build.
 */
export function renderNotices(product: string, sections: readonly NoticeSection[]): string {
  const printed = new Map<string, string>();
  const parts = sections.flatMap((section) => {
    const sorted = [...section.entries].sort((a, b) =>
      byCodePoint(`${a.name}@${a.versions.join(",")}`, `${b.name}@${b.versions.join(",")}`),
    );
    const blocks = sorted.map((entry) => noticeBlock(entry, printed));
    return [`${section.title}\n${"-".repeat(section.title.length)}`, ...blocks];
  });
  const header = `${product} includes the third-party software listed below.\n`;
  return `${[header, ...parts].join(`\n${rule}\n\n`)}\n`;
}
