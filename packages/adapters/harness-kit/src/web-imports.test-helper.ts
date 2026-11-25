// Follows every module a Web entry reaches and lists the imports a runtime
// without Node can't load: `node:` modules and third-party packages. Only
// `import type` and `export type` are skipped, since TypeScript drops them.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** How the walker reads a module and resolves an import; the disk and Node's resolution by default. */
export interface ModuleSource {
  read(file: string): string;
  /** The file `specifier` names from `from`; throws when it can't be resolved. */
  resolve(specifier: string, from: string): string;
}

/**
 * The file a package specifier such as `@halonicjs/std` or
 * `@halonicjs/adapter-harness-kit/web` names from `from`: the package is
 * looked for in the `node_modules` folders from `from` up, as Node does, so
 * a package the importing one doesn't depend on isn't found; then its
 * `exports` entry gives the file.
 */
function resolvePackage(specifier: string, from: string): string {
  const [scope = "", name = "", ...rest] = specifier.split("/");
  const subpath = rest.length === 0 ? "." : `./${rest.join("/")}`;
  for (let folder = dirname(from); ; folder = dirname(folder)) {
    const packageFolder = join(folder, "node_modules", scope, name);
    if (existsSync(join(packageFolder, "package.json"))) {
      const manifest: { exports?: Record<string, string> } = JSON.parse(
        readFileSync(join(packageFolder, "package.json"), "utf8"),
      );
      const target = manifest.exports?.[subpath];
      if (target === undefined) throw new Error(`${specifier} isn't exported`);
      return join(packageFolder, target);
    }
    if (dirname(folder) === folder) throw new Error(`${specifier} isn't installed`);
  }
}

/** This repo's modules on disk, each import resolved from the file that makes it. */
export const diskModules: ModuleSource = {
  read: (file) => readFileSync(file, "utf8"),
  resolve: (specifier, from) =>
    specifier.startsWith(".") ? resolve(dirname(from), specifier) : resolvePackage(specifier, from),
};

/** `import … from`, `export … from`, a bare `import "…"` and `import("…")`, each at a line's start. */
const importPatterns: readonly RegExp[] = [
  /^\s*(?:import|export)\s+(?<typeOnly>type\s+)?[^;]*?\bfrom\s*["'](?<specifier>[^"']+)["']/gm,
  /^\s*import\s*["'](?<specifier>[^"']+)["']/gm,
  /\bimport\(\s*["'](?<specifier>[^"']+)["']\s*\)/g,
];

/** The value imports of one module's text, without the `import type` and `export type` ones. */
export function valueImports(text: string): string[] {
  const found: string[] = [];
  for (const pattern of importPatterns) {
    for (const match of text.matchAll(pattern)) {
      const { typeOnly, specifier } = match.groups ?? {};
      if (typeOnly === undefined && specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

/**
 * Every import reached from `entries` that a Web runtime can't load, as
 * `<file> -> <specifier>`; empty when there is none. An import that can't be
 * resolved is listed too, so the check fails rather than skip it.
 */
export function nonWebImports(entries: readonly string[], source = diskModules): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const queue = [...entries];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of valueImports(source.read(file))) {
      const workspaceModule = specifier.startsWith(".") || specifier.startsWith("@halonicjs/");
      if (!workspaceModule) {
        problems.push(`${file} -> ${specifier}`);
        continue;
      }
      try {
        queue.push(source.resolve(specifier, file));
      } catch {
        problems.push(`${file} -> ${specifier} (unresolved)`);
      }
    }
  }
  return problems;
}
