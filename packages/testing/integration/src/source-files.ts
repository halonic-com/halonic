// Finds the code the source scan reads when a test doesn't hand it over, so
// the scan can't be skipped by leaving `sources` out. The suite runs in Node,
// so it reads the files itself; the integration's own code never gets a file
// system.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { expect } from "vitest";
import { fail } from "./failure.ts";
import { sourceImports } from "./source-scan.ts";

/** The file endings of code the source scan reads. */
const codeFile = /\.(?:[cm]?js|[cm]?ts)$/;

/** Test files, which run only in the suite and may use Node. */
const testFile = /\.(?:test|spec)\.[cm]?[jt]s$|\.test-helper\.[cm]?[jt]s$/;

/**
 * The code files in `root` and below, by their path from `base` with `/`
 * between folders. Skips `node_modules`, and test files when asked.
 */
export function codeFilesIn(
  root: string,
  base: string,
  options: { skipTests: boolean },
): Record<string, string> {
  const sources: Record<string, string> = {};
  const files = existsSync(root) ? readdirSync(root, { recursive: true, encoding: "utf8" }) : [];
  for (const file of files.sort()) {
    if (!codeFile.test(file) || file.split(sep).includes("node_modules")) continue;
    if (options.skipTests && testFile.test(file)) continue;
    const path = join(root, file);
    sources[relative(base, path).split(sep).join("/")] = readFileSync(path, "utf8");
  }
  return sources;
}

/**
 * The code beside the running test file, in its folder and below, other
 * than tests: what the suite scans for an integration whose test passes no
 * `sources`. Fails when there is no running test or no code there.
 */
export function testFolderSources(): Record<string, string> {
  const testPath =
    expect.getState().testPath ??
    fail("pass `sources`: the suite can't tell which test is running");
  const folder = dirname(testPath);
  const sources = codeFilesIn(folder, folder, { skipTests: true });
  if (Object.keys(sources).length === 0)
    fail(`found no code beside ${testPath} to scan; pass the integration's files as \`sources\``);
  return sources;
}

/**
 * `sources` plus every code file in `folder` they import by a relative
 * path, directly or through each other, keyed by path from `folder`. An
 * import that leaves the folder or names no file is left to the scan and
 * the loader.
 */
export function withImportedFiles(
  folder: string,
  sources: Readonly<Record<string, string>>,
): Record<string, string> {
  const found: Record<string, string> = { ...sources };
  const waiting = Object.keys(found);
  for (let file = waiting.pop(); file !== undefined; file = waiting.pop()) {
    for (const { specifier } of sourceImports(found[file] ?? "")) {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
      const target = existingFile(folder, posix.join(posix.dirname(file), specifier));
      if (target === undefined || target in found) continue;
      found[target] = readFileSync(join(folder, target), "utf8");
      waiting.push(target);
    }
  }
  return found;
}

/** The file an import names, as written or as TypeScript's `.js` to `.ts`, if it is in the folder. */
function existingFile(folder: string, path: string): string | undefined {
  if (path.startsWith("../") || path === "..") return undefined;
  const candidates = [path, path.replace(/\.([cm]?)js$/, ".$1ts")];
  return candidates.find((candidate) => {
    const full = join(folder, candidate);
    return codeFile.test(candidate) && existsSync(full) && statSync(full).isFile();
  });
}
