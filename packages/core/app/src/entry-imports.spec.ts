// Helper for the entry-point tests: what an entry point the engine uses
// reaches, so the Worker never parses `yaml` or a package root (HAL-16764).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

/**
 * What a file imports by value: `import … from`, `export … from`, `import "…"`
 * and `import("…")`. `import type` and `export type` are left out, because
 * they are erased before anything runs.
 */
const valueImport =
  /(?:^|[\n;])\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\bfrom\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;

/** The packages an entry point the engine uses must never reach. */
function isForbidden(specifier: string): boolean {
  if (specifier === "yaml" || specifier === "@halonicjs/yaml") return true;
  if (specifier === "@halonicjs/app" || specifier === "@halonicjs/format") return true;
  return (
    specifier.startsWith("@halonicjs/workspace") && specifier !== "@halonicjs/workspace/trust-url"
  );
}

/** Every package `file` reaches by value, following relative files and `@halonicjs/*` entries transitively. */
function packagesReached(file: string, seen: Set<string>, packages: Set<string>): void {
  if (seen.has(file)) return;
  seen.add(file);
  for (const [, staticSpecifier, dynamicSpecifier] of readFileSync(file, "utf8").matchAll(
    valueImport,
  )) {
    const specifier = staticSpecifier ?? dynamicSpecifier;
    if (specifier === undefined) continue;
    if (specifier.startsWith(".")) {
      packagesReached(resolve(dirname(file), specifier), seen, packages);
    } else {
      packages.add(specifier);
      if (specifier.startsWith("@halonicjs/") && !isForbidden(specifier)) {
        packagesReached(createRequire(file).resolve(specifier), seen, packages);
      }
    }
  }
}

/** The forbidden packages `entry` reaches by value, sorted: `yaml`, a package root, or `workspace` past `./trust-url`. */
export function forbiddenImportsOf(entry: string): string[] {
  const packages = new Set<string>();
  packagesReached(entry, new Set(), packages);
  return [...packages].filter(isForbidden).sort();
}
