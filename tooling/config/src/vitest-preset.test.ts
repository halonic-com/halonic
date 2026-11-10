import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NoSkippedTestsReporter } from "./no-skipped-reporter.ts";
import { UnrunTestFilesReporter } from "./unrun-files-reporter.ts";
import {
  definePackageTestConfig,
  fastCheckSetupFile,
  testResultsFile,
  testTimeoutOverride,
  testWorkerLimit,
} from "./vitest-preset.ts";

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

describe("testWorkerLimit", () => {
  it("keeps Vitest's defaults in CI unless HALONIC_TEST_WORKERS asks for a count", () => {
    expect(testWorkerLimit({ CI: "true" })).toBeUndefined();
    expect(testWorkerLimit({ CI: "true", HALONIC_TEST_WORKERS: "many" })).toBeUndefined();
    expect(testWorkerLimit({ CI: "true", HALONIC_TEST_WORKERS: "4" })).toBe(4);
  });

  it("caps the workers at 2 outside CI", () => {
    expect(testWorkerLimit({})).toBe(2);
  });

  it("takes a whole number of 1 or more from HALONIC_TEST_WORKERS", () => {
    expect(testWorkerLimit({ HALONIC_TEST_WORKERS: "6" })).toBe(6);
    expect(testWorkerLimit({ HALONIC_TEST_WORKERS: "0" })).toBe(2);
    expect(testWorkerLimit({ HALONIC_TEST_WORKERS: "many" })).toBe(2);
  });
});

describe("testTimeoutOverride", () => {
  it("keeps Vitest's defaults without a usable HALONIC_TEST_TIMEOUT", () => {
    expect(testTimeoutOverride({})).toBeUndefined();
    expect(testTimeoutOverride({ HALONIC_TEST_TIMEOUT: "0" })).toBeUndefined();
    expect(testTimeoutOverride({ HALONIC_TEST_TIMEOUT: "slow" })).toBeUndefined();
  });

  it("takes a whole number of milliseconds from HALONIC_TEST_TIMEOUT", () => {
    expect(testTimeoutOverride({ HALONIC_TEST_TIMEOUT: "30000" })).toBe(30_000);
  });
});
