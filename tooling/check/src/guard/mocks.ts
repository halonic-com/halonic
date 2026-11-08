import { posix } from "node:path";
import type { CheckContext } from "../lib/context.ts";
import { isSourceFile, isTestFile, splitBareSpecifier } from "../lib/source-files.ts";
import { findVerifiesCalls } from "../lib/verifies-calls.ts";
import { owningPackage, type WorkspacePackage } from "../lib/workspace.ts";
import type { Checkouts, GuardFinding } from "./finding.ts";
import { type MockUse, readTestFileFacts } from "./test-file-facts.ts";

/**
 * Plan 9.3, point 3: a new `vi.mock` of the module a requirement is about
 * needs a note, because the test would no longer run the code it proves.
 * A requirement is about its own package, so this finds a new mock, in a
 * file with `verifies(…)` tests, of a module inside the same package: a
 * relative import, or the package's own name.
 */
export function checkMocks({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  for (const file of head.files) {
    const pkg = owningPackage(file, head.packages);
    if (!isTestFile(file) || !isSourceFile(file) || pkg === undefined || pkg.directory === ".") {
      continue;
    }
    const ids = findVerifiesCalls(file, head.read(file)).flatMap((call) => call.id ?? []);
    if (ids.length === 0) {
      continue;
    }
    const before = new Set(ownMocks(base, file, pkg).map((mock) => mock.target));
    for (const mock of ownMocks(head, file, pkg)) {
      if (before.has(mock.target)) {
        continue;
      }
      findings.push({
        subject: file,
        file,
        line: mock.line,
        message: `${file} adds vi.mock("${mock.specifier}"), which replaces code of ${pkg.manifest.name ?? pkg.directory}, the package its requirements (${[...new Set(ids)].join(", ")}) are about.`,
      });
    }
  }
  return findings;
}

/** The mocks in a test file of modules inside its own package, with the module they hit. */
function ownMocks(
  context: CheckContext,
  file: string,
  pkg: WorkspacePackage,
): (MockUse & { target: string })[] {
  if (!context.files.includes(file)) {
    return [];
  }
  const own: (MockUse & { target: string })[] = [];
  for (const mock of readTestFileFacts(file, context.read(file)).mocks) {
    const target = targetInPackage(mock.specifier, file, pkg);
    if (target !== undefined) {
      own.push({ ...mock, target });
    }
  }
  return own;
}

/** The module a specifier points at when it is inside the package, else `undefined`. */
function targetInPackage(
  specifier: string,
  file: string,
  pkg: WorkspacePackage,
): string | undefined {
  if (specifier.startsWith(".")) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    return target.startsWith(`${pkg.directory}/`) ? target : undefined;
  }
  const { name, subpath } = splitBareSpecifier(specifier);
  return name === pkg.manifest.name ? `${name}:${subpath}` : undefined;
}
