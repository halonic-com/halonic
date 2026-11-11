import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";

const entry = resolve(dirname(fileURLToPath(import.meta.url)), "../cli/guard-notes.ts");

/** Static `import … from` and `export … from` specifiers, not `import type` and not `import()`. */
function staticSpecifiers(text: string): string[] {
  const pattern = /^(?:import|export)\s(?!type\s)[^;]*?\sfrom\s+"([^"]+)"|^import\s+"([^"]+)"/gm;
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? "");
}

/** Every package a static import chain from `file` reaches, with the file that imports it. */
function packagesReached(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) {
    return [];
  }
  seen.add(file);
  const reached: string[] = [];
  for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
    if (specifier.startsWith(".")) {
      reached.push(...packagesReached(resolve(dirname(file), specifier), seen));
    } else if (!specifier.startsWith("node:")) {
      reached.push(`${specifier} (imported by ${file.slice(file.indexOf("tooling/check"))})`);
    }
  }
  return reached;
}

verifies("check.guard-notes-own-paths", () => {
  test("guard-notes.ts never reaches a package import, because its workflow has no install", () => {
    expect(packagesReached(entry)).toEqual([]);
  });

  test("the import walk sees a package import", () => {
    expect(staticSpecifiers('import ts from "typescript";\nimport type { A } from "x";\n')).toEqual(
      ["typescript"],
    );
  });
});
