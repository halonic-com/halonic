import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import { checkPackages, exportKeys } from "../rules/packages.ts";
import {
  coreOrder,
  type FixturePackage,
  feature,
  format,
  manifestFor,
  removeFixtureRepo,
  rulesHit,
  runChecks,
  std,
  studioApp,
  writeFixtureRepo,
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

  it("flags a package staged for npm that isn't listed as published", () => {
    const staged = stdWith({
      private: true,
      halonic: {
        layer: "core",
        owner: "liam",
        coverage: defaultCoverageFloors.core,
        publish: { name: "@halonicjs/core/std" },
      },
    });
    const notListed = messages([staged], { coreOrder: ["@halonicjs/std"] });
    expect(notListed.some((message) => message.includes('It has "halonic.publish"'))).toBe(true);
    const listed = messages([staged], {
      coreOrder: ["@halonicjs/std"],
      policy: (policy) => ({ ...policy, published: ["@halonicjs/std"] }),
    });
    expect(listed).toEqual([]);
  });

  it("publishes a package as its folder's subpath of the layer package, or as the layer's main entry", () => {
    const publishedAs = (name: string) =>
      messages(
        [
          stdWith({
            private: true,
            halonic: {
              layer: "core",
              owner: "liam",
              coverage: defaultCoverageFloors.core,
              publish: { name },
            },
          }),
        ],
        {
          coreOrder: ["@halonicjs/std"],
          policy: (policy) => ({ ...policy, published: ["@halonicjs/std"] }),
        },
      );
    expect(publishedAs("@halonicjs/core")).toEqual([]);
    expect(publishedAs("@halonicjs/std")).toEqual([
      '"halonic.publish.name" must be "@halonicjs/core/std" (the layer package with the folder as subpath) or "@halonicjs/core" (the layer\'s main entry), not "@halonicjs/std".',
    ]);
    expect(publishedAs("@halonicjs/core/stdlib")).toHaveLength(1);
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
      '"exports" may only contain ".". "./internal" would let other packages import internals. A deliberate extra entry point needs an "extraExports" entry in tooling/check/policy.json.',
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

describe("tooling/check: packages, extraExports", () => {
  /** `pkg` with a `key` entry point next to `.`. */
  function withSubpath(pkg: FixturePackage, key = "./recording"): FixturePackage {
    return {
      ...pkg,
      manifest: {
        ...pkg.manifest,
        exports: { ".": "./src/index.ts", [key]: "./src/recording.ts" },
      },
      files: {
        "src/index.ts": "export const x = 1;\n",
        ...pkg.files,
        "src/recording.ts": "export const r = 1;\n",
      },
    };
  }
  /** The policy option that sets `extraExports`. */
  const allow = (extraExports: Record<string, string[]>) => ({
    coreOrder,
    policy: (policy: Record<string, unknown>) => ({ ...policy, extraExports }),
  });
  const allowFormat = allow({ "@halonicjs/format": ["./recording"] });
  const notListed = (name: string, allowed: string, key: string) =>
    `packages packages/core/${name}/package.json: "exports" may only contain ${allowed}. "${key}" would let other packages import internals. A deliberate extra entry point needs an "extraExports" entry in tooling/check/policy.json.`;
  const problems = (packages: FixturePackage[], options: Parameters<typeof runChecks>[1]) =>
    runChecks(packages, options).map(
      (problem) => `${problem.rule} ${problem.file}: ${problem.message}`,
    );

  it("lets a listed package export a listed subpath, and others import it", () => {
    const workflow: FixturePackage = {
      directory: "packages/core/workflow",
      manifest: manifestFor("@halonicjs/workflow", "core", {
        dependencies: { "@halonicjs/format": "workspace:*" },
      }),
      files: {
        "src/index.ts": 'import { r } from "@halonicjs/format/recording";\nexport const w = r;\n',
      },
    };
    expect(
      runChecks([std, withSubpath(format), workflow], {
        ...allowFormat,
        coreOrder: [...coreOrder, "@halonicjs/workflow"],
      }),
    ).toEqual([]);
  });

  it("refuses the subpath without an entry", () => {
    expect(problems([std, withSubpath(format)], { coreOrder })).toEqual([
      notListed("format", '"."', "./recording"),
    ]);
  });

  it("refuses the same subpath on another package", () => {
    expect(problems([withSubpath(std), format], allowFormat)).toEqual([
      notListed("std", '"."', "./recording"),
    ]);
  });

  it("refuses a subpath the entry doesn't list", () => {
    expect(problems([std, withSubpath(format, "./internal")], allowFormat)).toEqual([
      notListed("format", '"." and "./recording"', "./internal"),
    ]);
  });

  it("reports an entry for a package that isn't in the repo, which allows nothing", () => {
    expect(
      problems([std, withSubpath(format)], allow({ "@halonicjs/nope": ["./recording"] })),
    ).toEqual([
      'packages tooling/check/policy.json: "extraExports" lists "@halonicjs/nope", which is not a package in this repo. Remove it.',
      notListed("format", '"."', "./recording"),
    ]);
  });

  it("reports a __proto__ entry instead of dropping it", () => {
    const extraExports = JSON.parse('{ "__proto__": ["./recording"] }');
    expect(problems([std, format], allow(extraExports))).toEqual([
      'packages tooling/check/policy.json: "extraExports" lists "__proto__", which is not a package in this repo. Remove it.',
    ]);
  });

  it("warns about an entry for a tooling package", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", { exports: undefined }),
    };
    const root = writeFixtureRepo([tool, studioApp([])], {
      policy: (policy) => ({ ...policy, extraExports: { "@halonicjs/tooling-x": ["./cli"] } }),
    });
    try {
      expect(
        checkPackages(loadContext(root)).problems.map((problem) => [
          problem.severity,
          problem.message,
        ]),
      ).toEqual([
        [
          "warning",
          '"extraExports" lists "@halonicjs/tooling-x", a package in tooling, whose exports aren\'t limited. Remove it.',
        ],
      ]);
    } finally {
      removeFixtureRepo(root);
    }
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
