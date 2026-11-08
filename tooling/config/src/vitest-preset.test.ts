import { describe, expect, it } from "vitest";
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
});
