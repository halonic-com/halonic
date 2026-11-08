import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { startVitest } from "vitest/node";
import { skippedTestNames } from "./no-skipped-reporter.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const presetPath = join(import.meta.dirname, "vitest-preset.ts");

interface PresetRun {
  readonly results: Record<string, string | undefined>;
  readonly skipped: string[];
}

/** Runs the preset on a throwaway package: each test's result by name, and the skipped tests. */
async function runWithPreset(testFile: string): Promise<PresetRun> {
  const root = mkdtempSync(join(tmpdir(), "halonic-preset-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "sample.test.ts"), testFile);
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(
      join(root, "vitest.config.ts"),
      `import { definePackageTestConfig } from ${JSON.stringify(pathToFileURL(presetPath).href)};\n` +
        "export default definePackageTestConfig({ test: { coverage: { enabled: false } } });\n",
    );
    const vitest = await startVitest("test", [], {
      root,
      config: join(root, "vitest.config.ts"),
      watch: false,
      reporters: [],
    });
    const results: Record<string, string | undefined> = {};
    for (const file of vitest.state.getFiles()) {
      for (const task of file.tasks) {
        results[task.name] = task.result?.state;
      }
    }
    const skipped = skippedTestNames(vitest.state.getTestModules());
    await vitest.close();
    return { results, skipped };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Lints one test file with the shared Biome config, in a throwaway folder
 * whose biome.json extends it, and returns the rules the file broke.
 */
function lintTestFile(text: string): string[] {
  const root = mkdtempSync(join(tmpdir(), "halonic-biome-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "sample.test.ts"), text);
    writeFileSync(
      join(root, "biome.json"),
      JSON.stringify({ root: true, extends: [join(import.meta.dirname, "..", "biome.jsonc")] }),
    );
    const biome = join(repoRoot, "node_modules", "@biomejs", "biome", "bin", "biome");
    const run = spawnSync(process.execPath, [biome, "lint", "--reporter=github", "."], {
      cwd: root,
      encoding: "utf8",
    });
    return [...run.stdout.matchAll(/^::\w+ title=([^,]+),/gm)].map((match) => match[1] ?? "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Each test starts a Vitest run or a Biome process, which is slow when the whole repo tests at once.
const slow = 60_000;

describe("Vitest preset", () => {
  it(
    "fails a test that never calls expect() and passes one that does",
    async () => {
      const { results } = await runWithPreset(
        [
          'import { expect, it } from "vitest";',
          'it("checks nothing", () => {});',
          'it("checks something", () => {',
          "  expect(1 + 1).toBe(2);",
          "});",
          "",
        ].join("\n"),
      );
      expect(results).toEqual({ "checks nothing": "fail", "checks something": "pass" });
    },
    slow,
  );
});

describe("skipped tests", () => {
  it(
    "names every test that did not run, however it was skipped",
    async () => {
      const { skipped } = await runWithPreset(
        [
          'import { expect, it } from "vitest";',
          'it.todo("later");',
          'it("skips itself", (ctx) => {',
          "  ctx.skip();",
          "  expect(1).toBe(1);",
          "});",
          'it.skipIf(true)("skipped by condition", () => {',
          "  expect(1).toBe(1);",
          "});",
          'it("runs", () => {',
          "  expect(1).toBe(1);",
          "});",
          "",
        ].join("\n"),
      );
      expect(skipped.map((name) => name.split(": ")[1]).sort()).toEqual([
        "later",
        "skipped by condition",
        "skips itself",
      ]);
    },
    slow,
  );
});

describe("Biome config", () => {
  it.each([
    'it.skip("later", () => {});',
    'test.skip("later", () => {});',
    'describe.skip("later", () => {});',
    'xit("later", () => {});',
  ])("rejects a skipped test: %s", (line) => {
    const source = `import { describe, it, test } from "vitest";\n\n${line}\n`;
    expect(lintTestFile(source)).toContain("lint/suspicious/noSkippedTests");
  });

  it("accepts a test that runs", () => {
    const source =
      'import { expect, it } from "vitest";\n\nit("runs", () => {\n  expect(1).toBe(1);\n});\n';
    expect(lintTestFile(source)).toEqual([]);
  });
});
