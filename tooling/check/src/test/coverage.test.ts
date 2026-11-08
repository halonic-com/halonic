import { describe, expect, it } from "vitest";
import { coverageFloorProblems, testSetupProblems } from "../lib/coverage.ts";
import { manifestFor, runChecks } from "./fixture-repo.ts";

describe("tooling/check: coverage floors", () => {
  it("accepts the layer default and a higher floor", () => {
    expect(coverageFloorProblems({ lines: 90, branches: 85 }, "core")).toEqual([]);
    expect(coverageFloorProblems({ lines: 100, branches: 95.5 }, "core")).toEqual([]);
    expect(coverageFloorProblems({ lines: 80 }, "adapters")).toEqual([]);
  });

  it("requires a floor in every package but the root", () => {
    const { coverage: _, ...halonic } = manifestFor("@halonicjs/std", "core")["halonic"] as Record<
      string,
      unknown
    >;
    const messages = runChecks(
      [
        {
          directory: "packages/core/std",
          manifest: { ...manifestFor("@halonicjs/std", "core"), halonic },
        },
      ],
      { coreOrder: ["@halonicjs/std"] },
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.file).toBe("packages/core/std/package.json");
    expect(messages[0]?.message).toContain('"coverage": { "lines": 90, "branches": 85 }');
  });

  it("keeps core at 90% of lines and 85% of branches", () => {
    expect(coverageFloorProblems({ lines: 89 }, "core")).toEqual([
      '"halonic.coverage.lines" is 89, below the 90 that the core layer requires.',
      '"halonic.coverage" needs "branches". "halonic": { "coverage": { "lines": 90, "branches": 85 } } is the default.',
    ]);
    expect(coverageFloorProblems({ lines: 90, branches: 80 }, "core")).toHaveLength(1);
  });

  it("lets tooling and testing start below the default, but not without lines", () => {
    expect(coverageFloorProblems({ lines: 28, branches: 28 }, "tooling")).toEqual([]);
    expect(coverageFloorProblems({ lines: 50 }, "testing")).toEqual([]);
    expect(coverageFloorProblems({ branches: 50 }, "tooling")).toHaveLength(1);
  });

  it("rejects floors that aren't percentages and unknown fields", () => {
    expect(coverageFloorProblems(90, "core")).toHaveLength(1);
    expect(coverageFloorProblems([], "core")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: "90", branches: 85 }, "core")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: 120 }, "tooling")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: 80, functions: 80 }, "tooling")).toEqual([
      '"halonic.coverage" takes only "lines", "branches" and "measuredIn", not "functions".',
    ]);
  });
});

describe("tooling/check: floors can't be bypassed", () => {
  const std = (extra: Record<string, unknown> = {}, files?: Record<string, string>) => ({
    directory: "packages/core/std",
    manifest: manifestFor("@halonicjs/std", "core", extra),
    ...(files === undefined
      ? {}
      : { files: { "src/index.ts": "export const x = 1;\n", ...files } }),
  });
  const messages = (pkg: ReturnType<typeof std>): string[] =>
    runChecks([pkg], { coreOrder: ["@halonicjs/std"] }).map((problem) => problem.message);

  it("passes a package that runs the shared preset as is", () => {
    expect(messages(std())).toEqual([]);
  });

  it("rejects a floor of 0 in testing and tooling", () => {
    expect(coverageFloorProblems({ lines: 0 }, "tooling")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: 50, branches: 0 }, "testing")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: 1 }, "tooling")).toEqual([]);
  });

  it("rejects a test script that turns coverage off", () => {
    for (const script of [
      "vitest run --coverage.enabled=false",
      "vitest run --coverage=false",
      "vitest",
      "echo ok",
    ]) {
      expect(messages(std({ scripts: { test: script } }))).toHaveLength(1);
    }
    expect(messages(std({ scripts: {} }))).toHaveLength(1);
  });

  it("rejects a vitest config that opts out or is missing", () => {
    for (const config of [
      "export default definePackageTestConfig({ test: { coverage: { enabled: false } } });",
      "export default definePackageTestConfig({ test: { coverage: { thresholds: {} } } });",
      "export default definePackageTestConfig({ thresholds: {} });",
      "export default defineConfig({});",
    ]) {
      expect(messages(std({}, { "vitest.config.ts": config }))).toHaveLength(1);
    }
    expect(testSetupProblems("vitest run", undefined)).toHaveLength(1);
  });
});

describe("tooling/check: a floor measured in another package's run", () => {
  const contracts = (coverage: Record<string, unknown>) => ({
    directory: "packages/testing/contracts",
    manifest: manifestFor("@halonicjs/testing-contracts", "testing", {
      halonic: { layer: "testing", owner: "julian", coverage },
    }),
  });
  const memory = (extra: Record<string, unknown> = {}, files?: Record<string, string>) => ({
    directory: "packages/adapters/memory",
    manifest: manifestFor("@halonicjs/adapter-memory", "adapters", {
      halonic: { layer: "adapters", owner: "julian", runtime: "any", coverage: { lines: 80 } },
      devDependencies: { "@halonicjs/testing-contracts": "workspace:*" },
      ...extra,
    }),
    ...(files === undefined
      ? {}
      : { files: { "src/index.ts": "export const x = 1;\n", ...files } }),
  });
  const measured = { lines: 80, measuredIn: "@halonicjs/adapter-memory" };
  const messages = (...packages: Parameters<typeof runChecks>[0]): string[] =>
    runChecks(packages).map((problem) => problem.message);

  it("accepts measuredIn in the testing layer with at least the default floor", () => {
    expect(coverageFloorProblems(measured, "testing")).toEqual([]);
    expect(coverageFloorProblems({ ...measured, lines: 95, branches: 90 }, "testing")).toEqual([]);
    expect(messages(contracts(measured), memory())).toEqual([]);
  });

  it("rejects measuredIn outside the testing layer, without a name or below the default", () => {
    expect(coverageFloorProblems({ ...measured, lines: 90, branches: 85 }, "core")).toHaveLength(1);
    expect(coverageFloorProblems({ ...measured, lines: 80 }, "tooling")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: 80, measuredIn: "" }, "testing")).toHaveLength(1);
    expect(coverageFloorProblems({ lines: 80, measuredIn: 3 }, "testing")).toHaveLength(1);
    expect(coverageFloorProblems({ ...measured, lines: 79 }, "testing")).toEqual([
      '"halonic.coverage.lines" must be at least 80 with "measuredIn": a floor measured elsewhere can\'t be lower than the default.',
    ]);
  });

  it("rejects a measuredIn package that doesn't exist or is the package itself", () => {
    for (const name of [
      "@halonicjs/adapter-missing",
      "@halonicjs/testing-contracts",
      "@halonicjs/root",
    ]) {
      expect(messages(contracts({ ...measured, measuredIn: name }), memory())).toEqual([
        `"halonic.coverage.measuredIn" names "${name}", which isn't another package in this repo.`,
      ]);
    }
  });

  it("rejects a measuredIn package that doesn't depend on this one", () => {
    expect(messages(contracts(measured), memory({ devDependencies: {} }))).toEqual([
      '@halonicjs/adapter-memory must list @halonicjs/testing-contracts in "dependencies" or "devDependencies", so its test run measures this package\'s src.',
    ]);
    const peerOnly = memory({
      devDependencies: {},
      peerDependencies: { "@halonicjs/testing-contracts": "workspace:*" },
    });
    expect(messages(contracts(measured), peerOnly).join("\n")).toContain("must list");
    const asDependency = memory({
      devDependencies: {},
      dependencies: { "@halonicjs/testing-contracts": "workspace:*" },
    });
    expect(messages(contracts(measured), asDependency).join("\n")).not.toContain("must list");
  });

  it("rejects a measuredIn package whose run doesn't enforce floors", () => {
    const optedOut = memory({}, { "vitest.config.ts": "export default defineConfig({});\n" });
    const problems = messages(contracts(measured), optedOut);
    expect(problems).toContain(
      '@halonicjs/adapter-memory must run its tests through the shared preset ("vitest run" and definePackageTestConfig()), so this package\'s floor is enforced there.',
    );
  });
});
