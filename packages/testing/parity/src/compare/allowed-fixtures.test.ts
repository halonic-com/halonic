import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { allowedDifferencesFile, readAllowedDifferences } from "../allowed-differences.ts";
import { fileChecks } from "./file-checks.ts";

const fixtures = fileURLToPath(new URL("../../fixtures/", import.meta.url));

// Read once, while the file loads: on a slow disk under load, reading every
// fixture can take longer than a test's time limit.
const names = new Set(fileChecks(fixtures).map((check) => check.name));

verifies("parity.allowed-fixture-differences", () => {
  it("names only fixture files the compare lists, in the package's own file", () => {
    const listed = readAllowedDifferences(allowedDifferencesFile).flatMap((entry) =>
      (entry.fixtures ?? []).map((fixture) => `${fixture.case}: ${fixture.file}`),
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((name) => !names.has(name))).toEqual([]);
  });
});
