import { existsSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob, relative, resolve } from "node:path";
import { findRepoRoot } from "@halonicjs/tooling-check";
import { describe, expect, it } from "vitest";
import { codegenTask, turboFile } from "./turbo.ts";

// The codegen task lists the discover script's own source by hand, so that a
// change to an unrelated check doesn't invalidate it and every task after it.
// This test keeps that list honest: if the script starts importing a file the
// inputs don't cover, Turbo could replay a generated file built by old code.

const root = findRepoRoot();
const entry = "tooling/discover/src/cli/discover.ts";
const workspaceSources: Record<string, string> = {
  "@halonicjs/tooling-check": "tooling/check/src/index.ts",
};
// Anchored to the start of a line, so an import inside a string or comment doesn't count.
const importPattern = /^\s*(?:import|export)\b[^'"]*?from\s*["']([^"']+)["']/gm;
const sideEffectImportPattern = /^\s*import\s*["']([^"']+)["']/gm;

function importedFiles(file: string, seen: Set<string>): Set<string> {
  if (seen.has(file)) {
    return seen;
  }
  if (!existsSync(join(root, file))) {
    throw new Error(`The discover script's imports name a file that doesn't exist: ${file}`);
  }
  seen.add(file);
  const text = readFileSync(join(root, file), "utf8");
  for (const match of [
    ...text.matchAll(importPattern),
    ...text.matchAll(sideEffectImportPattern),
  ]) {
    const specifier = match[1] ?? "";
    if (specifier.startsWith(".")) {
      importedFiles(relative(root, resolve(root, dirname(file), specifier)), seen);
      continue;
    }
    const workspaceSource = workspaceSources[specifier];
    if (workspaceSource !== undefined) {
      importedFiles(workspaceSource, seen);
    }
  }
  return seen;
}

function isCodegenInput(file: string, globs: readonly string[]): boolean {
  let included = false;
  for (const glob of globs) {
    if (glob.startsWith("!")) {
      included = included && !matchesGlob(file, glob.slice(1));
    } else {
      included = included || matchesGlob(file, glob);
    }
  }
  return included;
}

describe("the codegen task's inputs", () => {
  it("cover every file the discover script imports", () => {
    const config = JSON.parse(readFileSync(join(root, turboFile), "utf8")) as {
      tasks: Record<string, { inputs: string[] }>;
    };
    const globs = config.tasks[codegenTask]?.inputs ?? [];
    const uncovered = [...importedFiles(entry, new Set())].filter(
      (file) => !isCodegenInput(file, globs),
    );
    expect(uncovered).toEqual([]);
  });
});
