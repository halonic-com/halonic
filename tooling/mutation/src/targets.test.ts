import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";
import {
  hasCode,
  mutationTargets,
  parityFixturesVariable,
  sandboxEnv,
  strykerConfig,
} from "./targets.ts";

const folders: string[] = [];

function packageWith(...files: string[]): string {
  const folder = mkdtempSync(join(tmpdir(), "mutation-target-"));
  folders.push(folder);
  for (const file of files) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), "export {};\n");
  }
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

verifies("mutation.only-packages-with-code", () => {
  test("a package from pnpm new has no code to mutate", () => {
    expect(hasCode(packageWith("src/index.ts", "src/index.test.ts", "package.json"))).toBe(false);
  });

  test("a source file next to index.ts is code, also in a subfolder", () => {
    expect(hasCode(packageWith("src/index.ts", "src/reader/scanner.ts"))).toBe(true);
  });

  test("test files and test helper folders are not code", () => {
    expect(hasCode(packageWith("src/index.ts", "src/test/helpers.ts", "src/a.test.tsx"))).toBe(
      false,
    );
  });

  test("a package without a src folder has no code", () => {
    expect(hasCode(packageWith("README.md"))).toBe(false);
  });

  test("the targets are the four packages the nightly run covers", () => {
    expect(mutationTargets).toEqual([
      "packages/core/workflow",
      "packages/core/routines",
      "packages/core/schema-kit",
      "packages/core/yaml",
    ]);
  });
});

describe("strykerConfig", () => {
  test("mutates the sources but not the tests, and writes where it is told", () => {
    const config = strykerConfig({
      vitestRunner: "/r/runner.js",
      report: "/w/yaml.json",
      sandbox: "/w/s",
    });
    expect(config["mutate"]).toEqual([
      "src/**/*.ts",
      "src/**/*.tsx",
      "!src/**/*.test.ts",
      "!src/**/*.test.tsx",
    ]);
    expect(config["plugins"]).toEqual(["/r/runner.js"]);
    expect(config["jsonReporter"]).toEqual({ fileName: "/w/yaml.json" });
    expect(config["tempDirName"]).toBe("/w/s");
  });
});

verifies("mutation.parity-fixtures-in-sandbox", () => {
  test("the sandbox run is told the real parity fixtures folder", () => {
    expect(sandboxEnv("/repo")).toEqual({
      [parityFixturesVariable]: join("/repo", "packages", "testing", "parity", "fixtures"),
    });
  });

  test("the variable names a folder that exists in this repo", () => {
    const root = join(import.meta.dirname, "..", "..", "..");
    expect(existsSync(sandboxEnv(root)[parityFixturesVariable] ?? "")).toBe(true);
  });
});
