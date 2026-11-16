// Helper for the entry-point tests: what a yaml-free entry point imports.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** What a file imports: `from "…"`, `import "…"` and `import("…")`, in either quotes. */
const importSpecifier = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

/** The relative files `file` imports, followed transitively, and every package it imports, sorted. */
export function importsOf(
  file: string,
  seen = new Set<string>(),
  packages = new Set<string>(),
): { files: string[]; packages: string[] } {
  if (!seen.has(file)) {
    seen.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(importSpecifier)) {
      if (specifier?.startsWith(".")) {
        importsOf(resolve(dirname(file), specifier), seen, packages);
      } else if (specifier !== undefined) {
        packages.add(specifier);
      }
    }
  }
  return { files: [...seen], packages: [...packages].sort() };
}
