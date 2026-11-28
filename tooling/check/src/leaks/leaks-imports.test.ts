import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/*
 * CI runs the leak guard on plain Node with nothing installed, so the
 * personal-terms secret never meets third-party code. Every file
 * `leaks.ts` loads may therefore import only relative paths and `node:`
 * modules: a package name resolves only through `node_modules`, and the
 * guard would fail on `main` where no pull request can fix it.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const entry = join(repoRoot, "tooling/check/src/cli/leaks.ts");

/** `import … from "x"`, `export … from "x"`, `import "x"` and `import("x")`. */
const importSpecifier =
  /^\s*(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm;

/** Imports that only bring in types: Node strips them before running. */
const typeOnly = /^\s*(?:import|export)\s+type\b/;

function runtimeImports(text: string): string[] {
  return [...text.matchAll(importSpecifier)]
    .filter((match) => !typeOnly.test(match[0]))
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "");
}

/** Every file the entry loads, each with the imports that aren't relative or `node:`. */
function nonRelativeImports(start: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const queue = [start];
  const seen = new Set(queue);
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const bad: string[] = [];
    for (const specifier of runtimeImports(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        const next = join(dirname(file), specifier);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      } else if (!specifier.startsWith("node:")) {
        bad.push(specifier);
      }
    }
    found.set(relative(repoRoot, file), bad);
  }
  return found;
}

test("the leak guard loads only relative files and node: modules", () => {
  const files = nonRelativeImports(entry);
  const offending = [...files].filter(([, bad]) => bad.length > 0);
  expect(offending).toEqual([]);
});

test("the leak guard loads nothing from outside tooling/check/ but the secret rules", () => {
  const outside = [...nonRelativeImports(entry).keys()].filter(
    (file) => !file.startsWith("tooling/check/"),
  );
  expect(outside).toEqual(["packages/core/std/src/secret-rules.ts"]);
});

test("the import reader sees package names in every import form", () => {
  const text = [
    'import { a } from "@halonicjs/std";',
    'export { b } from "zod";',
    'import "side-effect";',
    'const c = await import("late");',
    'import type { D } from "types-only";',
    'import { e } from "./local.ts";',
  ].join("\n");
  expect(runtimeImports(text)).toEqual([
    "@halonicjs/std",
    "zod",
    "side-effect",
    "late",
    "./local.ts",
  ]);
});
