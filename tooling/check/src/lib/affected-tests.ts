import { dependencyFields, owningPackage, type WorkspacePackage } from "./workspace.ts";

/**
 * Which packages' tests a pull request needs (HAL-12539). CI's build job and
 * the merge base's tests run only these, so the guard compares the same set
 * on both sides. Typecheck, lint and build still run for every package, and
 * the merge queue and `main` still test everything.
 */
export type TestSelection =
  | { readonly kind: "all"; readonly reason: string }
  | { readonly kind: "some"; readonly packages: readonly string[] };

/**
 * Files every package's tests depend on: the install (lockfile, root
 * manifest, workspace file, patches), Turbo and Biome settings, the shared
 * tsconfig and Vitest preset in `tooling/config`, the test helpers in
 * `testing/spec`, and the CI files and checks that decide what runs. A
 * change to one of these tests everything. A folder ends in `/`.
 */
export const fullSuitePaths: readonly string[] = [
  ".gitattributes",
  ".github/actions/",
  ".github/workflows/",
  ".npmrc",
  "biome.json",
  "package.json",
  "packages/testing/spec/",
  "patches/",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tooling/check/",
  "tooling/config/",
  "turbo.json",
];

/**
 * Files outside every package that no test reads: docs, decision notes,
 * changesets and repo metadata. The same list as the docs-only rule of
 * ci.yml's `changes` job.
 */
const noTestPattern =
  /^(docs\/|decisions\/|\.changeset\/.*\.md$|\.github\/(ISSUE_TEMPLATE\/|CODEOWNERS$|pull_request_template\.md$))|(^|\/)(README|AGENTS|CHANGELOG)\.md$/;

/** The packages whose tests read `examples/` (see AGENTS.md, Commands). */
export const examplesReaders: readonly string[] = [
  "halonic",
  "@halonicjs/workspace",
  "@halonicjs/test-runner",
];

function matchesPath(file: string, path: string): boolean {
  return path.endsWith("/") ? file.startsWith(path) : file === path;
}

/** The workspace packages that depend on each package, by name. */
function dependentsByName(packages: readonly WorkspacePackage[]): Map<string, string[]> {
  const names = new Set(packages.map((entry) => entry.manifest.name));
  const dependents = new Map<string, string[]>();
  for (const entry of packages) {
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(entry.manifest[field] ?? {})) {
        if (names.has(dependency) && entry.manifest.name !== undefined) {
          dependents.set(dependency, [...(dependents.get(dependency) ?? []), entry.manifest.name]);
        }
      }
    }
  }
  return dependents;
}

/** The given packages and every workspace package that depends on them, transitively. */
function withDependents(
  start: Iterable<string>,
  packages: readonly WorkspacePackage[],
): Set<string> {
  const dependents = dependentsByName(packages);
  const selected = new Set<string>();
  const pending = [...start];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (!selected.has(name)) {
      selected.add(name);
      pending.push(...(dependents.get(name) ?? []));
    }
  }
  return selected;
}

/**
 * The packages whose tests a change needs: every package with a changed file
 * and every package that depends on one, or "all" when a changed file is one
 * of `fullSuitePaths`, lies outside every package and isn't docs, or when the
 * list of changed files is empty (it couldn't be read).
 */
export function testSelection(
  changed: readonly string[],
  packages: readonly WorkspacePackage[],
): TestSelection {
  if (changed.length === 0) {
    return { kind: "all", reason: "no changed files were found" };
  }
  const touched = new Set<string>();
  for (const file of changed) {
    if (fullSuitePaths.some((path) => matchesPath(file, path))) {
      return { kind: "all", reason: `${file} changed, and every package's tests depend on it` };
    }
    const owner = owningPackage(file, packages);
    if (owner !== undefined && owner.directory !== "." && owner.manifest.name !== undefined) {
      touched.add(owner.manifest.name);
    } else if (file.startsWith("examples/")) {
      for (const reader of examplesReaders) {
        touched.add(reader);
      }
    } else if (!noTestPattern.test(file)) {
      return { kind: "all", reason: `${file} is outside every package, so any test may read it` };
    }
  }
  const known = new Set(packages.map((entry) => entry.manifest.name));
  const selected = [...withDependents(touched, packages)].filter((name) => known.has(name));
  return { kind: "some", packages: selected.sort() };
}
