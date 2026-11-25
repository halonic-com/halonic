import { createHash } from "node:crypto";
import { posix } from "node:path";

// A definition can take its parameters or its whole shape from a shared file
// next to its folder (`src/github-parameters.ts`, `src/device-check.ts`).
// Hashing the definition file alone would let a change there alter what a
// definition accepts without changing its hash, so the hash covers every
// package-local file the definition reaches through relative imports (HAL-18198).

// `from "./x.ts"`, `import "./x.ts"` and `import("./x.ts")`: every way a module names another.
const relativeImportPattern = /\b(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g;

/** Reads one file, as text or bytes, by its path relative to the repo root. */
export type ReadSource = (file: string) => string | Uint8Array;

function bytesOf(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

/** The relative imports a source names, resolved against its own path. */
export function relativeImports(file: string, source: string): string[] {
  const folder = posix.dirname(file);
  return [...source.matchAll(relativeImportPattern)].map((match) =>
    posix.normalize(posix.join(folder, match[1] ?? "")),
  );
}

/**
 * The entry file and every file it reaches through relative imports, the
 * entry first and the others sorted by path, so the order never depends on
 * how the imports are written.
 */
export function sourceFiles(entryFile: string, readFile: ReadSource): string[] {
  const reached = new Set<string>([entryFile]);
  const waiting = [entryFile];
  for (let file = waiting.pop(); file !== undefined; file = waiting.pop()) {
    const source = new TextDecoder().decode(bytesOf(readFile(file)));
    for (const imported of relativeImports(file, source)) {
      if (reached.has(imported)) continue;
      reached.add(imported);
      waiting.push(imported);
    }
  }
  const others = [...reached].filter((file) => file !== entryFile).sort();
  return [entryFile, ...others];
}

/**
 * The SHA-256 of an entry's source: for each of its source files in
 * `sourceFiles` order, its path relative to the package, its length in bytes
 * and its bytes. The path and length keep two different sets of files from
 * ever hashing the same.
 */
export function catalogSourceHash(
  packageDirectory: string,
  entryFile: string,
  readFile: ReadSource,
): string {
  const hash = createHash("sha256");
  for (const file of sourceFiles(entryFile, readFile)) {
    const bytes = bytesOf(readFile(file));
    hash.update(`${posix.relative(packageDirectory, file)}\n${bytes.byteLength}\n`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}
