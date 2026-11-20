import { execFileSync } from "node:child_process";
import type { CheckContext } from "./context.ts";
import { expectedRequirementId, isRequirementFile } from "./requirements.ts";
import { isSourceFile, isTestFile } from "./source-files.ts";
import { findVerifiesCalls } from "./verifies-calls.ts";
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

/**
 * Docs a package's tests read, by path, with the packages whose tests read
 * them. Every other doc is read by no test.
 */
export const docsReaders: Readonly<Record<string, readonly string[]>> = {
  "docs/guides/area-owners.md": ["@halonicjs/tooling-check"],
  "docs/guides/integrations.md": ["@halonicjs/format"],
  "docs/legal/dco-standing-statement.md": ["@halonicjs/tooling-check"],
};

/** The packages whose tests read `examples/` (see AGENTS.md, Commands). */
export const examplesReaders: readonly string[] = [
  "halonic",
  "@halonicjs/workspace",
  "@halonicjs/test-runner",
];

/** The packages whose tests read a file outside every package, if any do. */
function readersOf(file: string): readonly string[] | undefined {
  if (file.startsWith("examples/")) {
    return examplesReaders;
  }
  return Object.hasOwn(docsReaders, file) ? docsReaders[file] : undefined;
}

function matchesPath(file: string, path: string): boolean {
  return path.endsWith("/") ? file.startsWith(path) : file === path;
}

/** The workspace packages that depend on each package, by name, plus `verifiers`. */
function dependentsByName(
  packages: readonly WorkspacePackage[],
  verifiers: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
  const names = new Set(packages.map((entry) => entry.manifest.name));
  const dependents = new Map<string, string[]>();
  for (const [name, testers] of verifiers) {
    dependents.set(name, [...testers]);
  }
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
  verifiers: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const dependents = dependentsByName(packages, verifiers);
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
 * For each package, by name, the packages whose tests `verifies()` one of its
 * requirements. A few test a requirement of a package they don't depend on,
 * and the trace check needs those tests to prove the requirement.
 *
 * Pass the changed files as `changed` to get the links of both sides of the
 * change, whichever side is checked out. A requirement's package comes from
 * its file's path, so the changed paths add the requirements the other side
 * has and this one doesn't, a deleted one included. A test file that names
 * a requirement differently on the other side has changed, and its package
 * is selected anyway.
 */
export function verifierPackages(
  context: Pick<CheckContext, "files" | "packages" | "read">,
  changed: readonly string[] = [],
): Map<string, string[]> {
  const ownerOf = requirementOwners([...context.files, ...changed], context.packages);
  const verifiers = new Map<string, string[]>();
  for (const file of context.files) {
    const tester = owningPackage(file, context.packages);
    if (!isTestFile(file) || !isSourceFile(file) || !isNamedPackage(tester)) {
      continue;
    }
    for (const call of findVerifiesCalls(file, context.read(file))) {
      const owner = call.id === undefined ? undefined : ownerOf.get(call.id);
      if (owner !== undefined && owner !== tester.manifest.name) {
        addVerifier(verifiers, owner, tester.manifest.name);
      }
    }
  }
  return verifiers;
}

function addVerifier(verifiers: Map<string, string[]>, owner: string, tester: string): void {
  const testers = verifiers.get(owner) ?? [];
  if (!testers.includes(tester)) {
    verifiers.set(owner, [...testers, tester]);
  }
}

/** A package other than the repo root, with a name. */
function isNamedPackage(
  pkg: WorkspacePackage | undefined,
): pkg is WorkspacePackage & { manifest: { name: string } } {
  return pkg !== undefined && pkg.directory !== "." && pkg.manifest.name !== undefined;
}

/** Each requirement ID's package, by name. */
function requirementOwners(
  files: readonly string[],
  packages: readonly WorkspacePackage[],
): Map<string, string> {
  const ownerOf = new Map<string, string>();
  for (const file of files) {
    const pkg = owningPackage(file, packages);
    if (isRequirementFile(file) && isNamedPackage(pkg)) {
      ownerOf.set(expectedRequirementId(file, pkg.directory), pkg.manifest.name);
    }
  }
  return ownerOf;
}

/**
 * The packages whose tests a change needs: every package with a changed file
 * and every package that depends on one or verifies one's requirements
 * (`verifiers`), the readers of a changed file in `examples/` or
 * `docsReaders`, or "all" when a changed file is one of `fullSuitePaths`,
 * lies outside every package and isn't docs, or when the list of changed
 * files is empty (it couldn't be read).
 */
export function testSelection(
  changed: readonly string[],
  packages: readonly WorkspacePackage[],
  verifiers: ReadonlyMap<string, readonly string[]> = new Map(),
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
    } else if (readersOf(file) !== undefined) {
      for (const reader of readersOf(file) ?? []) {
        touched.add(reader);
      }
    } else if (!noTestPattern.test(file)) {
      return { kind: "all", reason: `${file} is outside every package, so any test may read it` };
    }
  }
  const known = new Set(packages.map((entry) => entry.manifest.name));
  const selected = [...withDependents(touched, packages, verifiers)].filter((name) =>
    known.has(name),
  );
  return { kind: "some", packages: selected.sort() };
}

/**
 * The tests a pull request needs, for the checkout in `context`: the files
 * `git diff <base>...<head>` lists, run through `testSelection`. CI's build
 * job, the merge base's tests and the requirement guard all call this with
 * the merge ref's first parent as `base`, so they select the same packages.
 * When git can't list the changes, every package's tests are selected.
 */
export function selectTests(context: CheckContext, base: string, head = "HEAD"): TestSelection {
  let changed: string;
  try {
    changed = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
      cwd: context.root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return { kind: "all", reason: `git couldn't list the changes (${(error as Error).message})` };
  }
  const files = changed.split("\n").filter((file) => file !== "");
  return testSelection(files, context.packages, verifierPackages(context, files));
}

/** The folders of the selected packages, or `undefined` when every package is selected. */
export function selectedFolders(
  selection: TestSelection,
  packages: readonly WorkspacePackage[],
): ReadonlySet<string> | undefined {
  if (selection.kind === "all") {
    return undefined;
  }
  const names = new Set(selection.packages);
  return new Set(
    packages
      .filter((pkg) => pkg.manifest.name !== undefined && names.has(pkg.manifest.name))
      .map((pkg) => pkg.directory),
  );
}
