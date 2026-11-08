import { describe, expect, it } from "vitest";
import { coverageFloorProblems } from "../lib/coverage.ts";
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
      '"halonic.coverage" takes only "lines" and "branches", not "functions".',
    ]);
  });
});
