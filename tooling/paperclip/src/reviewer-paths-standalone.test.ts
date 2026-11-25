import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";

/**
 * The live Merger's loader rule (HAL-18282): it fetches `reviewer-paths.ts`
 * from `main` with its relative imports, recursively, skips `import type`
 * and runs the files with plain Node type stripping, without `node_modules`.
 */
const loaderRule =
  "the live Merger loads reviewer-paths.ts with only its relative ./*.ts runtime imports " +
  "from tooling/paperclip/src/, skips `import type`, and runs them with plain Node type " +
  "stripping and no node_modules (HAL-18282)";

const sourceDir = dirname(fileURLToPath(import.meta.url));

/** Runtime imports and re-exports after type stripping: `from "x"`, `import "x"` and `import("x")`. */
const importPatterns = [
  /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm,
  /^\s*import\s*["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
];

/**
 * The modules a file loads at run time. Node's own type stripping removes
 * `import type` and `export type` first, as it does when the Merger runs the
 * file, and refuses syntax it can't strip, such as an `enum`.
 */
function runtimeImports(file: string): string[] {
  const text = readFileSync(join(sourceDir, file), "utf8");
  let code: string;
  try {
    code = stripTypeScriptTypes(text);
  } catch (error) {
    throw new Error(`${file} can't run with plain Node type stripping: ${loaderRule}.`, {
      cause: error,
    });
  }
  return importPatterns.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

/** Every file the Merger fetches, starting at `reviewer-paths.ts`; a wrong import throws. */
function loaderFiles(): string[] {
  const files = new Set<string>();
  const pending = ["reviewer-paths.ts"];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) {
      continue;
    }
    files.add(file);
    for (const specifier of runtimeImports(file)) {
      const target = /^\.\.?\/.*\.ts$/.test(specifier)
        ? relative(sourceDir, join(sourceDir, dirname(file), specifier))
        : undefined;
      if (target === undefined || target.startsWith("..")) {
        throw new Error(
          `${file} has the runtime import "${specifier}", which the Merger can't load: ${loaderRule}. ` +
            "Make it `import type`, or move the code into a relative .ts file.",
        );
      }
      pending.push(target);
    }
  }
  return [...files].sort();
}

verifies("paperclip.reviewer-paths-standalone", () => {
  test("reviewer-paths.ts has only relative .ts runtime imports inside tooling/paperclip/src/", () => {
    expect(loaderFiles()).toContain("routing.ts");
  });

  test("reviewer-paths.ts runs on its own with plain Node type stripping", () => {
    const folder = mkdtempSync(join(tmpdir(), "reviewer-paths-"));
    try {
      for (const file of loaderFiles()) {
        copyFileSync(join(sourceDir, file), join(folder, file));
      }
      const script = `
        const { reviewerFor } = await import(${JSON.stringify(join(folder, "reviewer-paths.ts"))});
        console.log(JSON.stringify([
          reviewerFor({ files: ["packages/studio/features/inbox/src/view.tsx"], changedLines: 40, sensitive: false }),
          reviewerFor({ files: ["pnpm-lock.yaml"], changedLines: 40, sensitive: false }),
        ]));`;
      const run = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
        cwd: folder,
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "" },
      });
      expect(run.status, `${loaderRule}.\n${run.stderr}`).toBe(0);
      expect(JSON.parse(run.stdout), loaderRule).toEqual(["julian", "liam"]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
