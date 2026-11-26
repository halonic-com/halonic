import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { isRoutineExcluded } from "../reviewer-paths-routine.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

/**
 * The relative files a source file loads at run time: `import` and `export
 * … from` statements and `import(…)`, without `import type` and `export
 * type`, which TypeScript erases.
 */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const statements = source.matchAll(
    /^(?:import|export)\s+(type\s+)?(?:[^;]*?\sfrom\s+)?["'](\.[^"']+)["']/gm,
  );
  const dynamic = source.matchAll(/\bimport\(\s*["'](\.[^"']+)["']\s*\)/g);
  return [
    ...[...statements].filter(([, type]) => type === undefined).map(([, , path]) => path),
    ...[...dynamic].map(([, path]) => path),
  ].map((path) => join(dirname(file), path ?? ""));
}

/** Every file the verdict gate's own files load at run time, theirs included. */
function gateClosure(): string[] {
  const queue = readdirSync(here)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(here, name));
  const seen = new Set<string>();
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (!seen.has(file)) {
      seen.add(file);
      queue.push(...runtimeImports(file));
    }
  }
  return [...seen].map((file) => relative(repoRoot, file).split("\\").join("/")).sort();
}

verifies("paperclip.verdicts-gate", () => {
  test("every file the verdict gate runs is one a routine review can't change (HAL-20010)", () => {
    const closure = gateClosure();
    expect(closure).toContain("tooling/paperclip/src/verdicts/verdict-gate.ts");
    expect(closure).toContain("tooling/paperclip/src/pr-tools/approvals.ts");
    expect(closure.filter((path) => !isRoutineExcluded(path))).toEqual([]);
  });
});
