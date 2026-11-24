// Helper for engine-graph.test.ts: which files the engine's entry point
// reaches by value, across packages, the way a bundler would (HAL-16764).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The repo's root, five folders above this file. */
export const repoRoot = resolve(import.meta.dirname, "../../../../..");

/**
 * An import or re-export with a `from`. The clause is matched by shape, so a
 * match never runs on into the next statement.
 */
const fromStatement =
  /^[ \t]*(?:import|export)\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\}|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s*from\s*["']([^"']+)["']/gm;

/** A side-effect import: `import "x"`. */
const sideEffectStatement = /^[ \t]*import\s*["']([^"']+)["']/gm;

/** A dynamic import with a plain string: `import("x")`. */
const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Drops block comments and line comments, so an example in a comment isn't an import. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * What a source file imports by value, in the order written. These count:
 * `import … from`, `export … from`, `export * from`, a side-effect
 * `import "x"`, and `import { type A } from "x"`, which
 * `verbatimModuleSyntax` keeps as `import "x"`. Only `import type` and
 * `export type` are left out, because they are erased. A dynamic `import()`
 * isn't followed: see `dynamicImportsOf`.
 */
export function valueImportsOf(source: string): string[] {
  const text = withoutComments(source);
  const specifiers: string[] = [];
  for (const [, typeOnly, specifier] of text.matchAll(fromStatement)) {
    if (typeOnly === undefined && specifier !== undefined) specifiers.push(specifier);
  }
  for (const [, specifier] of text.matchAll(sideEffectStatement)) {
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** The plain-string specifiers of every dynamic `import("x")` in a source file. */
export function dynamicImportsOf(source: string): string[] {
  return [...withoutComments(source).matchAll(dynamicImport)].flatMap(([, specifier]) =>
    specifier === undefined ? [] : [specifier],
  );
}

/** The folder of every package under `packages/`, by its name. */
function packageFolders(): Map<string, string> {
  const folders = new Map<string, string>();
  const visit = (folder: string, depth: number): void => {
    const manifest = join(folder, "package.json");
    if (existsSync(manifest)) {
      const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name: string };
      folders.set(name, folder);
      return;
    }
    if (depth === 0) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules")
        visit(join(folder, entry.name), depth - 1);
    }
  };
  visit(join(repoRoot, "packages"), 3);
  return folders;
}

/** The file a package specifier such as `@halonicjs/app/spend` points at, through the package's `exports`. */
function packageFile(specifier: string, folders: Map<string, string>): string | undefined {
  for (const [name, folder] of folders) {
    if (specifier !== name && !specifier.startsWith(`${name}/`)) continue;
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as {
      exports?: Record<string, string>;
    };
    const target = manifest.exports?.[`.${specifier.slice(name.length)}`];
    if (target === undefined) throw new Error(`${name} exports no "${specifier}"`);
    return join(folder, target);
  }
  return undefined;
}

/**
 * Every file reached by value from `entry`, following relative imports and the
 * repo's own packages, and every outside package named on the way, such as
 * `yaml`. Both sorted.
 */
export function valueGraphOf(entry: string): { files: string[]; outside: string[] } {
  const folders = packageFolders();
  const files = new Set<string>();
  const outside = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    if (!file.endsWith(".ts")) continue;
    for (const specifier of valueImportsOf(readFileSync(file, "utf8"))) {
      const next = specifier.startsWith(".")
        ? resolve(dirname(file), specifier)
        : packageFile(specifier, folders);
      if (next === undefined) outside.add(specifier);
      else pending.push(next);
    }
  }
  return { files: [...files].sort(), outside: [...outside].sort() };
}
