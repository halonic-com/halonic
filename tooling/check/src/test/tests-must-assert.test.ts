import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";
import { expect, test } from "vitest";

const biomeConfig = join(import.meta.dirname, "..", "..", "..", "config", "biome.jsonc");

verifies("check.tests-must-assert", () => {
  test("the shared Vitest preset requires an assertion in every test", () => {
    expect(definePackageTestConfig().test?.expect?.requireAssertions).toBe(true);
  });

  test("keeps the requirement when a package adds its own settings", () => {
    const config = definePackageTestConfig({ test: { environment: "node" } });
    expect(config.test?.expect?.requireAssertions).toBe(true);
  });

  test("Biome rejects skipped and focused tests", () => {
    const text = readFileSync(biomeConfig, "utf8");
    expect(text).toMatch(/"noSkippedTests": "error"/);
    expect(text).toMatch(/"noFocusedTests": "error"/);
  });
});
