import { describe, expect, it } from "vitest";
import { NoSkippedTestsReporter } from "./no-skipped-reporter.ts";
import { UnrunTestFilesReporter } from "./unrun-files-reporter.ts";
import { definePackageTestConfig, testResultsFile } from "./vitest-preset.ts";

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
});
