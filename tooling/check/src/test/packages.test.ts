import { describe, expect, it } from "vitest";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import { exportKeys } from "../rules/packages.ts";
import {
  coreOrder,
  type FixturePackage,
  feature,
  format,
  manifestFor,
  rulesHit,
  runChecks,
  std,
  studioApp,
} from "./fixture-repo.ts";

/** The messages of every error the checks report for these packages. */
function messages(packages: FixturePackage[], options?: Parameters<typeof runChecks>[1]): string[] {
  return runChecks(packages, options).map((problem) => problem.message);
}

/** `std` with its manifest changed. */
function stdWith(extra: Record<string, unknown>): FixturePackage {
  return { ...std, manifest: manifestFor("@halonicjs/std", "core", extra) };
}

describe("tooling/check: packages", () => {
  it("passes an empty package and an empty feature", () => {
    expect(
      runChecks([std, format, feature("agents"), studioApp(["agents"])], { coreOrder }),
    ).toEqual([]);
  });

  it("requires workspace:* for internal dependencies", () => {
    const ranged = {
      ...format,
      manifest: manifestFor("@halonicjs/format", "core", {
        dependencies: { "@halonicjs/std": "^0.1.0" },
      }),
    };
    expect(rulesHit([std, ranged], { coreOrder })).toEqual(["packages"]);
  });

  it("flags wrong names, public packages and a missing owner", () => {
    const wrong: FixturePackage = {
      directory: "packages/core/std",
      manifest: {
        name: "@halonicjs/stdlib",
        type: "module",
        exports: { ".": "./src/index.ts" },
        halonic: { layer: "core" },
      },
    };
    const messages = runChecks([wrong], { coreOrder: ["@halonicjs/stdlib"] }).map(
      (problem) => problem.message,
    );
    expect(messages.some((message) => message.includes('must be "@halonicjs/std"'))).toBe(true);
    expect(messages.some((message) => message.includes('"private": true'))).toBe(true);
    expect(messages.some((message) => message.includes("owner"))).toBe(true);
  });

  it("flags a package outside the package folders", () => {
    const stray: FixturePackage = {
      directory: "packages/misc/x",
      manifest: manifestFor("@halonicjs/x", "core"),
    };
    expect(
      messages([stray], {
        extraFiles: { "pnpm-workspace.yaml": "packages:\n  - packages/misc/*\n" },
      }).some((message) => message.includes("Packages live only in the folders")),
    ).toBe(true);
  });

  it("flags a declared layer that doesn't match the folder", () => {
    const found = messages(
      [
        stdWith({
          halonic: { layer: "studio", owner: "mateo", coverage: defaultCoverageFloors.core },
        }),
      ],
      {
        coreOrder: ["@halonicjs/std"],
      },
    );
    expect(found).toEqual([
      'Declare the layer: "halonic": { "layer": "core" }. The folder puts this package in the core layer.',
    ]);
  });

  it("flags a missing layer", () => {
    const found = messages(
      [stdWith({ halonic: { owner: "mateo", coverage: defaultCoverageFloors.core } })],
      {
        coreOrder: ["@halonicjs/std"],
      },
    );
    expect(found.some((message) => message.startsWith("Declare the layer"))).toBe(true);
  });
});

describe("tooling/check: packages, exports map", () => {
  const order = { coreOrder: ["@halonicjs/std"] };

  it("accepts a plain string export", () => {
    expect(runChecks([stdWith({ exports: "./src/index.ts" })], order)).toEqual([]);
  });

  it("requires an exports map", () => {
    expect(
      messages([stdWith({ exports: undefined })], order).some((message) =>
        message.startsWith('Add an "exports" map with "."'),
      ),
    ).toBe(true);
    expect(
      messages([stdWith({ exports: ["./src/index.ts"] })], order).some((message) =>
        message.startsWith('Add an "exports" map'),
      ),
    ).toBe(true);
  });

  it("refuses subpaths other than the public entry points", () => {
    const deep = stdWith({ exports: { ".": "./src/index.ts", "./internal": "./src/index.ts" } });
    expect(messages([deep], order)).toEqual([
      '"exports" may only contain .. "./internal" would let other packages import internals.',
    ]);
  });

  it("refuses a feature subpath outside a feature", () => {
    const withApi = stdWith({ exports: { ".": "./src/index.ts", "./api": "./src/index.ts" } });
    expect(rulesHit([withApi], order)).toEqual(["packages"]);
  });

  it("requires ./api on a feature and allows nothing else", () => {
    const noApi = feature("agents", { exports: { ".": "./src/index.ts" } });
    expect(
      messages([noApi, studioApp(["agents"])]).some((message) =>
        message.startsWith('A feature exports "./api"'),
      ),
    ).toBe(true);
    const extra = feature("agents", {
      exports: { ".": "./src/index.ts", "./api": "./src/api.ts", "./ui": "./src/index.ts" },
    });
    expect(
      messages([extra, studioApp(["agents"])]).some((message) =>
        message.includes('"./ui" would let other packages import internals'),
      ),
    ).toBe(true);
  });

  it("treats a conditions object as the package's own entry point", () => {
    const conditions = stdWith({ exports: { import: "./src/index.ts" } });
    expect(runChecks([conditions], order)).toEqual([]);
  });

  it("flags an export that points at a missing file", () => {
    expect(messages([stdWith({ exports: { ".": "./src/main.ts" } })], order)).toEqual([
      '"exports" points at ./src/main.ts, which doesn\'t exist.',
    ]);
  });

  it("doesn't ask apps and tooling for an exports map", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", { exports: undefined }),
    };
    expect(runChecks([tool, studioApp([])])).toEqual([]);
  });
});

describe("exportKeys", () => {
  it("lists the subpaths of an exports field", () => {
    expect(exportKeys("./src/index.ts")).toEqual(["."]);
    expect(exportKeys({ ".": "./a.ts", "./api": "./b.ts" })).toEqual([".", "./api"]);
    expect(exportKeys({ import: "./a.ts", default: "./a.ts" })).toEqual(["."]);
    expect(exportKeys(undefined)).toBeUndefined();
    expect(exportKeys(null)).toBeUndefined();
    expect(exportKeys(["./a.ts"])).toBeUndefined();
  });
});

describe("tooling/check: packages, coreOrder", () => {
  it("requires every core package in coreOrder", () => {
    expect(messages([std], { coreOrder: [] })).toEqual([
      'Core package "@halonicjs/std" is missing from "coreOrder". Add it after every core package it uses.',
    ]);
  });

  it("refuses names in coreOrder that aren't core packages", () => {
    expect(messages([std], { coreOrder: ["@halonicjs/std", "@halonicjs/gone"] })).toEqual([
      '"coreOrder" lists "@halonicjs/gone", which is not a core package. Remove it.',
    ]);
  });

  it("refuses an internal dependency that isn't in the workspace", () => {
    const missing = stdWith({ dependencies: { "@halonicjs/gone": "workspace:*" } });
    expect(
      messages([missing], { coreOrder: ["@halonicjs/std"] }).some((message) =>
        message.startsWith('"@halonicjs/gone" is not a package in this workspace'),
      ),
    ).toBe(true);
  });
});

describe("tooling/check: packages, reserved core prefixes", () => {
  it.each(["app-x", "adapter-x", "studio-x", "testing-x", "tooling-x"])(
    "refuses packages/core/%s",
    (folder) => {
      const core: FixturePackage = {
        directory: `packages/core/${folder}`,
        manifest: manifestFor(`@halonicjs/${folder}`, "core"),
      };
      const found = messages([core], { coreOrder: [`@halonicjs/${folder}`] });
      expect(found).toHaveLength(1);
      expect(found[0]).toContain("belong to other layers");
    },
  );

  it("allows names that only start with the same letters", () => {
    const core: FixturePackage = {
      directory: "packages/core/hosting",
      manifest: manifestFor("@halonicjs/hosting", "core"),
    };
    expect(runChecks([core], { coreOrder: ["@halonicjs/hosting"] })).toEqual([]);
  });

  it("allows the same prefixes in other layers", () => {
    const adapter: FixturePackage = {
      directory: "packages/adapters/studio-x",
      manifest: manifestFor("@halonicjs/adapter-studio-x", "adapters", {
        halonic: {
          layer: "adapters",
          owner: "mateo",
          runtime: "any",
          coverage: defaultCoverageFloors.adapters,
        },
      }),
    };
    expect(runChecks([adapter])).toEqual([]);
  });
});
