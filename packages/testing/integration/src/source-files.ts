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
 * What the suite scans for an integration whose test passes no `sources`:
 * the code beside the running test file, in its folder and below, and every
 * file the test imports by a relative path, directly or through other files,
 * keyed by path from the test's package (the nearest folder with a
 * `package.json`). Tests themselves are left out. Fails when there is no
 * running test, when the test imports code outside its package, or when
 * there is no code to scan.
 */
export function testFolderSources(): Record<string, string> {
  const testPath =
    expect.getState().testPath ??
    fail("pass `sources`: the suite can't tell which test is running");
  const folder = dirname(testPath);
  const root = packageRoot(folder);
  const testKey = relative(root, testPath).split(sep).join("/");
  const testText = readFileSync(testPath, "utf8");
  for (const path of relativeImports(testKey, testText)) {
    if (path.startsWith("../"))
      fail(
        `${testPath} imports ${path}, outside its package; pass the integration's files as \`sources\``,
      );
  }
  const beside = codeFilesIn(folder, root, { skipTests: true });
  const { [testKey]: _test, ...sources } = withImportedFiles(
    root,
    { ...beside, [testKey]: testText },
    { skipTests: true },
  );
  if (Object.keys(sources).length === 0)
    fail(`found no code beside ${testPath} to scan; pass the integration's files as \`sources\``);
  return sources;
}

/** The nearest folder from `folder` up that has a `package.json`, or `folder` when none has. */
function packageRoot(folder: string): string {
  for (let current = folder; ; current = dirname(current)) {
    if (existsSync(join(current, "package.json"))) return current;
    if (dirname(current) === current) return folder;
  }
}

/**
 * `sources` plus every code file in `folder` they import by a relative
 * path, directly or through each other, keyed by path from `folder`, and
 * test files only when not asked to skip them. An import that leaves the
 * folder or names no file is left to the scan and the loader.
 */
export function withImportedFiles(
  folder: string,
  sources: Readonly<Record<string, string>>,
  options: { skipTests: boolean } = { skipTests: false },
): Record<string, string> {
  const found: Record<string, string> = { ...sources };
  const waiting = Object.keys(found);
  for (let file = waiting.pop(); file !== undefined; file = waiting.pop()) {
    for (const path of relativeImports(file, found[file] ?? "")) {
      const target = existingFile(folder, path);
      if (target === undefined || target in found) continue;
      if (options.skipTests && testFile.test(target)) continue;
      found[target] = readFileSync(join(folder, target), "utf8");
      waiting.push(target);
    }
  }
  return found;
}

/** The paths `file`'s relative imports name, from the folder its path is relative to. */
function relativeImports(file: string, text: string): string[] {
  return sourceImports(text)
    .map(({ specifier }) => specifier)
    .filter((specifier) => specifier.startsWith("./") || specifier.startsWith("../"))
    .map((specifier) => posix.join(posix.dirname(file), specifier));
}

/** The file endings and index files Node and TypeScript try for an import written without them. */
const resolvedForms = [
  "",
  ".ts",
  ".js",
  ".mts",
  ".mjs",
  "/index.ts",
  "/index.js",
  "/index.mts",
  "/index.mjs",
];

/**
 * The file an import names, if it is in the folder: as written, as
 * TypeScript's `.js` for `.ts`, or with an ending or `index` file added.
 */
function existingFile(folder: string, path: string): string | undefined {
  if (path.startsWith("../") || path === "..") return undefined;
  const written = [path, path.replace(/\.([cm]?)js$/, ".$1ts")];
  const candidates = written.flatMap((form) => resolvedForms.map((ending) => `${form}${ending}`));
  return candidates.find((candidate) => {
    const full = join(folder, candidate);
    return codeFile.test(candidate) && existsSync(full) && statSync(full).isFile();
  });
}
