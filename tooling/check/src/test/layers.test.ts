import { describe, expect, it } from "vitest";
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

describe("tooling/check: layers", () => {
  it("stops core from using Node APIs and third-party code", () => {
    const leaky: FixturePackage = {
      ...std,
      manifest: manifestFor("@halonicjs/std", "core", { dependencies: { zod: "catalog:" } }),
      files: {
        "src/index.ts":
          'import { readFileSync } from "node:fs";\nimport { z } from "zod";\nexport const x = [readFileSync, z];\n',
      },
    };
    const problems = runChecks([leaky], { coreOrder: ["@halonicjs/std"] });
    expect(problems.some((problem) => problem.message.includes("Node APIs"))).toBe(true);
    expect(problems.some((problem) => problem.message.includes("third-party"))).toBe(true);
    expect(problems.some((problem) => problem.rule === "dependencies")).toBe(true);
  });

  it("enforces the declared core order", () => {
    expect(rulesHit([std, format], { coreOrder: ["@halonicjs/format", "@halonicjs/std"] })).toEqual(
      ["layers"],
    );
  });

  it("lets features use each other only through ./api", () => {
    const deep = feature(
      "runs",
      { dependencies: { "@halonicjs/studio-feature-agents": "workspace:*" } },
      {
        "src/index.ts":
          'import { f } from "@halonicjs/studio-feature-agents";\nexport const g = f;\n',
        "src/api.ts": "export {};\n",
      },
    );
    const viaApi = feature(
      "runs",
      { dependencies: { "@halonicjs/studio-feature-agents": "workspace:*" } },
      {
        "src/index.ts": 'export type { } from "@halonicjs/studio-feature-agents/api";\n',
        "src/api.ts": "export {};\n",
      },
    );
    const app = studioApp(["agents", "runs"]);
    expect(rulesHit([feature("agents"), deep, app])).toEqual(["layers"]);
    expect(rulesHit([feature("agents"), viaApi, app])).toEqual([]);
  });

  it("keeps Studio packages away from adapters and testing out of runtime", () => {
    const adapter: FixturePackage = {
      directory: "packages/adapters/git",
      manifest: manifestFor("@halonicjs/adapter-git", "adapters"),
    };
    const spec: FixturePackage = {
      directory: "packages/testing/spec",
      manifest: manifestFor("@halonicjs/testing-spec", "testing"),
    };
    const shell: FixturePackage = {
      directory: "packages/studio/shell",
      manifest: manifestFor("@halonicjs/studio-shell", "studio", {
        dependencies: {
          "@halonicjs/adapter-git": "workspace:*",
          "@halonicjs/testing-spec": "workspace:*",
        },
      }),
    };
    const messages = runChecks([adapter, spec, shell]).map((problem) => problem.message);
    expect(messages.some((message) => message.includes("only through studio/services"))).toBe(true);
    expect(messages.some((message) => message.includes("never a runtime dependency"))).toBe(true);
  });

  it("catches relative imports that leave the package and deep imports past exports", () => {
    const sneaky = {
      ...format,
      files: {
        "src/index.ts": 'import "../../std/src/index.ts";\nimport "@halonicjs/std/src/index.ts";\n',
      },
    };
    const messages = runChecks([std, sneaky], { coreOrder }).map((problem) => problem.message);
    expect(messages.some((message) => message.includes("reaches outside"))).toBe(true);
    expect(messages.some((message) => message.includes("not a public entry point"))).toBe(true);
  });

  it("lets the host use core only: no adapters and no Node APIs", () => {
    const adapter: FixturePackage = {
      directory: "packages/adapters/git",
      manifest: manifestFor("@halonicjs/adapter-git", "adapters"),
    };
    const host = (files: Record<string, string>, dependencies = {}): FixturePackage => ({
      directory: "packages/host",
      manifest: manifestFor("@halonicjs/host", "host", { dependencies }),
      files,
    });
    const usesAdapter = host(
      { "src/index.ts": 'import { x } from "@halonicjs/adapter-git";\nexport const y = x;\n' },
      { "@halonicjs/adapter-git": "workspace:*" },
    );
    const usesNode = host({
      "src/index.ts": 'import { readFileSync } from "node:fs";\nexport const y = readFileSync;\n',
    });
    const usesBareBuiltin = host({
      "src/index.ts": 'import { join } from "path";\nexport const y = join;\n',
    });
    const messages = (packages: FixturePackage[]): string[] =>
      runChecks(packages).map((problem) => problem.message);
    expect(messages([adapter, usesAdapter]).some((m) => m.includes("core packages only"))).toBe(
      true,
    );
    expect(messages([usesNode]).some((m) => m.includes('Node APIs ("node:fs")'))).toBe(true);
    expect(messages([usesBareBuiltin]).some((m) => m.includes('Node APIs ("path")'))).toBe(true);
    expect(
      rulesHit(
        [
          std,
          host(
            { "src/index.ts": 'export * from "@halonicjs/std";\n' },
            { "@halonicjs/std": "workspace:*" },
          ),
        ],
        { coreOrder: ["@halonicjs/std"] },
      ),
    ).toEqual([]);
  });
});
