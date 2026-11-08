import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import type { Layer } from "../lib/layout.ts";
import {
  type FixturePackage,
  manifestFor,
  realDependencyListPath,
  rulesHit,
  runChecks,
} from "./fixture-repo.ts";

describe("tooling/check: names and dependencies", () => {
  it("fails on the forbidden scopes anywhere", () => {
    const scoped = `import "@${"studio"}/core";\n`;
    expect(rulesHit([], { extraFiles: { "docs/notes.md": scoped } })).toEqual(["names"]);
  });

  it("requires catalog versions and approved dependencies", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", {
        devDependencies: { vitest: "^5.0.0", lodash: "catalog:" },
      }),
    };
    const messages = runChecks([tool]).map((problem) => problem.message);
    expect(messages.some((message) => message.includes('must be "catalog:"'))).toBe(true);
    expect(
      messages.some((message) => message.includes("isn't in tooling/check/dependencies.json")),
    ).toBe(true);
  });

  it("lets only testing packages list dev tooling as a peerDependency", () => {
    const peersOnVitest = (directory: string, name: string, layer: Layer): FixturePackage => ({
      directory,
      manifest: manifestFor(name, layer, {
        devDependencies: { vitest: "catalog:" },
        peerDependencies: { vitest: "catalog:" },
      }),
    });
    const spec = peersOnVitest("packages/testing/spec", "@halonicjs/testing-spec", "testing");
    const adapter = peersOnVitest("packages/adapters/git", "@halonicjs/adapter-git", "adapters");
    expect(runChecks([spec]).map((problem) => problem.message)).toEqual([]);
    const messages = runChecks([adapter]).map((problem) => problem.message);
    expect(messages.some((message) => message.includes("belongs in devDependencies"))).toBe(true);
  });

  it("keeps the approved UI libraries inside studio/kit", () => {
    const shell: FixturePackage = {
      directory: "packages/studio/shell",
      manifest: manifestFor("@halonicjs/studio-shell", "studio", {
        dependencies: { "react-data-grid": "catalog:" },
      }),
    };
    const kit: FixturePackage = {
      directory: "packages/studio/kit",
      manifest: manifestFor("@halonicjs/studio-kit", "studio", {
        dependencies: {
          "react-data-grid": "catalog:",
          remark: "catalog:",
          "remark-gfm": "catalog:",
        },
      }),
    };
    expect(runChecks([kit])).toEqual([]);
    expect(runChecks([kit, shell]).map((problem) => problem.message)).toEqual([
      '@halonicjs/studio-shell uses "react-data-grid". "react-data-grid" is allowed only in @halonicjs/studio-kit. Use the data grid from @halonicjs/studio-kit. See docs/guides/dependencies.md.',
    ]);
  });

  it("names every core exception's packages exactly", () => {
    const list = JSON.parse(readFileSync(realDependencyListPath, "utf8")) as {
      dependencies: Record<string, { category: string; allowedIn: string[] }>;
    };
    const exceptions = Object.entries(list.dependencies)
      .filter(([, entry]) => entry.category === "core-exception")
      .map(([name, entry]) => [name, entry.allowedIn]);
    expect(exceptions).toEqual([
      ["yaml", ["@halonicjs/yaml"]],
      ["zod", ["@halonicjs/schema-kit", "@halonicjs/format"]],
    ]);
  });

  it("rejects a wildcard in a core exception", () => {
    const wide = {
      "left-pad": {
        category: "core-exception",
        allowedIn: ["@halonicjs/*"],
        layers: ["core"],
        reason: "A test entry.",
      },
    };
    const messages = runChecks([], { extraDependencies: wide }).map((problem) => problem.message);
    expect(messages).toEqual([
      '"left-pad" is a core exception, so it names each core package exactly; "*" isn\'t allowed. Each one needs the user\'s approval.',
    ]);
  });

  it("keeps Studio and dev-tooling libraries out of the cloud runtime list", () => {
    const shipped = {
      "left-pad": {
        category: "studio-framework",
        allowedIn: ["@halonicjs/studio-kit"],
        layers: ["studio"],
        reason: "A test entry.",
        cloudRuntime: true,
      },
    };
    const messages = runChecks([], { extraDependencies: shipped }).map(
      (problem) => problem.message,
    );
    expect(messages).toEqual([
      "\"left-pad\" is studio-framework, so it can't be marked cloudRuntime. Only core exceptions and outside-world libraries may ship in a cloud runtime, with the user's approval.",
    ]);
  });

  it("fails on a forbidden scope in a file path", () => {
    const path = `docs/${"@halonic"}/notes.md`;
    const found = runChecks([], { extraFiles: { [path]: "Nothing to see.\n" } });
    expect(found.map((problem) => [problem.rule, problem.file])).toEqual([["names", path]]);
    expect(found[0]?.message).toContain("The path contains");
  });

  it("allows the @halonicjs scope", () => {
    expect(rulesHit([], { extraFiles: { "docs/notes.md": 'import "@halonicjs/std";\n' } })).toEqual(
      [],
    );
  });
});

/** A tooling package with these devDependencies. */
function toolWith(devDependencies: Record<string, string>, name = "x"): FixturePackage {
  return {
    directory: `tooling/${name}`,
    manifest: manifestFor(`@halonicjs/tooling-${name}`, "tooling", { devDependencies }),
  };
}

/** One entry of `dependencies.json`. */
function entry(
  allowedIn: string[],
  category = "dev-tooling",
  reason = "Because.",
  layers: string[] = [
    "core",
    "adapters",
    "host",
    "targets",
    "studio",
    "apps",
    "testing",
    "tooling",
  ],
) {
  return { category, allowedIn, layers, reason };
}

describe("tooling/check: dependencies.json", () => {
  it("uses a dependency only in the packages its allowedIn names", () => {
    const list = { vitest: entry(["@halonicjs/tooling-check"]) };
    expect(runChecks([toolWith({ vitest: "catalog:" })], { extraDependencies: list })).toEqual([
      expect.objectContaining({
        rule: "dependencies",
        message:
          '@halonicjs/tooling-x uses "vitest". "vitest" is allowed only in @halonicjs/tooling-check. See docs/guides/dependencies.md.',
      }),
    ]);
  });

  it("matches * in allowedIn against any text", () => {
    const list = { vitest: entry(["@halonicjs/tooling-*"]) };
    expect(runChecks([toolWith({ vitest: "catalog:" })], { extraDependencies: list })).toEqual([]);
    const narrow = { vitest: entry(["@halonicjs/app-*"]) };
    expect(rulesHit([toolWith({ vitest: "catalog:" })], { extraDependencies: narrow })).toEqual([
      "dependencies",
    ]);
  });

  it("keeps dev tooling in devDependencies", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", {
        dependencies: { vitest: "catalog:" },
      }),
    };
    const found = runChecks([tool], { extraDependencies: { vitest: entry(["*"]) } });
    expect(found.map((problem) => problem.message)).toEqual([
      '"vitest" is dev tooling and belongs in devDependencies; it must never ship.',
    ]);
  });

  it("lets other categories ship in dependencies", () => {
    const adapter: FixturePackage = {
      directory: "packages/adapters/x",
      manifest: manifestFor("@halonicjs/adapter-x", "adapters", {
        halonic: {
          layer: "adapters",
          owner: "mateo",
          runtime: "node",
          coverage: defaultCoverageFloors.adapters,
        },
        dependencies: { zod: "catalog:" },
      }),
    };
    const list = {
      zod: entry(["@halonicjs/adapter-x"], "outside-world", "Because.", ["adapters"]),
    };
    expect(runChecks([adapter], { extraDependencies: list })).toEqual([]);
  });

  it("stops on an unknown category", () => {
    const list = { vitest: entry(["*"], "nice-to-have") };
    expect(() =>
      runChecks([toolWith({ vitest: "catalog:" })], { extraDependencies: list }),
    ).toThrow(
      'dependencies["vitest"].category must be one of: core-exception, outside-world, studio-framework, dev-tooling',
    );
  });

  it("requires a reason", () => {
    const list = { vitest: entry(["*"], "dev-tooling", "  ") };
    expect(() =>
      runChecks([toolWith({ vitest: "catalog:" })], { extraDependencies: list }),
    ).toThrow('dependencies["vitest"].reason must be a non-empty string');
  });

  it("only warns about an entry no package uses", () => {
    expect(runChecks([], { extraDependencies: { vitest: entry(["*"]) } })).toEqual([]);
  });

  it("doesn't check internal dependencies against the list", () => {
    const tool = toolWith({ "@halonicjs/tooling-y": "workspace:*" });
    expect(runChecks([tool, toolWith({}, "y")])).toEqual([]);
  });
});
