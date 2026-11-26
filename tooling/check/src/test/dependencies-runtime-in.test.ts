import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

/** An adapter that lists `left-pad` in `dependencies`. */
function adapterShipping(name: string): FixturePackage {
  return {
    directory: `packages/adapters/${name}`,
    files: {
      "src/index.ts": 'import leftPad from "left-pad";\n\nexport const padded = leftPad("a", 2);\n',
    },
    manifest: manifestFor(`@halonicjs/adapter-${name}`, "adapters", {
      halonic: {
        layer: "adapters",
        owner: "mateo",
        runtime: "any",
        coverage: defaultCoverageFloors.adapters,
      },
      dependencies: { "left-pad": "catalog:" },
    }),
  };
}

/** A dev-tooling entry for `left-pad` with these extra fields. */
function leftPad(extra: Record<string, unknown>, allowedIn = ["@halonicjs/adapter-a"]) {
  return {
    "left-pad": {
      category: "dev-tooling",
      allowedIn,
      layers: ["adapters", "tooling"],
      reason: "A test entry.",
      ...extra,
    },
  };
}

function messages(packages: FixturePackage[], list: Record<string, unknown>): string[] {
  return runChecks(packages, { extraDependencies: list })
    .map((problem) => problem.message)
    .sort();
}

const devOnly = '"left-pad" is dev tooling and belongs in devDependencies; it must never ship.';
const devImport = '"left-pad" is dev tooling and may only be imported from tests and config files.';

verifies("check.dev-tooling-runtime-in", () => {
  test("lets dev tooling ship, and be imported from source, only in the one adapter runtimeIn names", () => {
    const list = leftPad({ runtimeIn: "@halonicjs/adapter-a" }, [
      "@halonicjs/adapter-a",
      "@halonicjs/adapter-b",
    ]);
    expect(messages([adapterShipping("a")], list)).toEqual([]);
    expect(messages([adapterShipping("b")], list)).toEqual([devOnly, devImport].sort());
  });

  test("keeps dev tooling out of dependencies without runtimeIn", () => {
    expect(messages([adapterShipping("a")], leftPad({}))).toEqual([devOnly, devImport].sort());
  });

  test("refuses a runtimeIn that isn't one adapter named in allowedIn", () => {
    const wide = "@halonicjs/adapter-*";
    expect(messages([], leftPad({ runtimeIn: wide }, [wide]))).toEqual([
      `"left-pad" has runtimeIn "${wide}": it names one "@halonicjs/adapter-<name>" (no *), which allowedIn also names exactly, with "adapters" in layers. See docs/guides/dependencies.md.`,
    ]);
    expect(messages([], leftPad({ runtimeIn: "@halonicjs/adapter-c" }))).toHaveLength(1);
    expect(
      messages([], leftPad({ runtimeIn: "@halonicjs/tooling-a" }, ["@halonicjs/tooling-a"])),
    ).toHaveLength(1);
  });

  test("refuses runtimeIn on a library that isn't dev tooling", () => {
    const list = {
      "left-pad": {
        category: "outside-world",
        allowedIn: ["@halonicjs/adapter-a"],
        layers: ["adapters"],
        reason: "A test entry.",
        runtimeIn: "@halonicjs/adapter-a",
      },
    };
    expect(messages([], list)).toEqual([
      '"left-pad" is outside-world, so it can\'t have runtimeIn: only dev tooling needs it. See docs/guides/dependencies.md.',
    ]);
  });
});
