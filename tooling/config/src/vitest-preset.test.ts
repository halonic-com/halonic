import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NoSkippedTestsReporter } from "./no-skipped-reporter.ts";
import { UnrunTestFilesReporter } from "./unrun-files-reporter.ts";
import { definePackageTestConfig, fastCheckSetupFile, testResultsFile } from "./vitest-preset.ts";

describe("definePackageTestConfig", () => {
  it("writes the result file with the JSON reporter", () => {
    const reporters = definePackageTestConfig().test?.reporters;
    expect(reporters).toContainEqual(["json", { outputFile: testResultsFile }]);
    expect(testResultsFile).toBe("test-results/vitest.json");
  });

  it("merges the package's own settings over the preset", () => {
    const config = definePackageTestConfig({ test: { environment: "jsdom" } });
    expect(config.test?.environment).toBe("jsdom");
    expect(config.test?.passWithNoTests).toBe(false);
  });

  it("refuses a package that turns requireAssertions off", () => {
    expect(() =>
      definePackageTestConfig({ test: { expect: { requireAssertions: false } } }),
    ).toThrow("requireAssertions");
  });

  it("fails the run when a test was skipped", () => {
    const reporters = definePackageTestConfig().test?.reporters;
    expect(
      Array.isArray(reporters) && reporters.some((r) => r instanceof NoSkippedTestsReporter),
    ).toBe(true);
  });

  it("fails the run when a test file never ran", () => {
    const reporters = definePackageTestConfig().test?.reporters;
    expect(
      Array.isArray(reporters) && reporters.some((r) => r instanceof UnrunTestFilesReporter),
    ).toBe(true);
  });

  it("adds GitHub annotations to the output in CI only", () => {
    vi.stubEnv("CI", "");
    expect(definePackageTestConfig().test?.reporters).not.toContain("github-actions");
    vi.stubEnv("CI", "true");
    expect(definePackageTestConfig().test?.reporters).toContain("github-actions");
  });

  it("sets the fast-check seed only in a package that uses fast-check", () => {
    // This package lists fast-check, and Vitest runs in its folder.
    expect(definePackageTestConfig().test?.setupFiles).toEqual([fastCheckSetupFile]);
    const other = mkdtempSync(join(tmpdir(), "halonic-preset-"));
    try {
      vi.spyOn(process, "cwd").mockReturnValue(other);
      expect(definePackageTestConfig().test?.setupFiles).toEqual([]);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});
