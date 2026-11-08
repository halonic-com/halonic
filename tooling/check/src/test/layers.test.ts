import { describe, expect, it } from "vitest";
import type { Layer } from "../lib/layout.ts";
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
      manifest: manifestFor("@halonicjs/std", "core", { dependencies: { lodash: "catalog:" } }),
      files: {
        "src/index.ts":
          'import { readFileSync } from "node:fs";\nimport _ from "lodash";\nexport const x = [readFileSync, _];\n',
      },
    };
    const problems = runChecks([leaky], { coreOrder: ["@halonicjs/std"] });
    expect(problems.some((problem) => problem.message.includes("Node APIs"))).toBe(true);
    expect(problems.some((problem) => problem.message.includes("third-party"))).toBe(true);
    expect(problems.some((problem) => problem.rule === "dependencies")).toBe(true);
  });

  it("lets a core exception into its named core packages only", () => {
    const usesZod = (directory: string, name: string): FixturePackage => ({
      directory,
      manifest: manifestFor(name, "core", { dependencies: { zod: "catalog:" } }),
      files: { "src/index.ts": 'import { z } from "zod";\nexport const s = z.string();\n' },
    });
    const schemaKit = usesZod("packages/core/schema-kit", "@halonicjs/schema-kit");
    const workflow = usesZod("packages/core/workflow", "@halonicjs/workflow");
    const order = { coreOrder: ["@halonicjs/schema-kit", "@halonicjs/workflow"] };

    expect(runChecks([schemaKit], { coreOrder: ["@halonicjs/schema-kit"] })).toEqual([]);

    const expected =
      '@halonicjs/workflow uses "zod". "zod" is allowed only in @halonicjs/schema-kit and @halonicjs/format. Use @halonicjs/schema-kit for validation, or move this code into an adapter. See docs/guides/dependencies.md.';
    const found = runChecks([schemaKit, workflow], order).map((problem) => [
      problem.rule,
      problem.file,
      problem.message,
    ]);
    expect(found).toEqual([
      ["layers", "packages/core/workflow/src/index.ts", expected],
      ["dependencies", "packages/core/workflow/package.json", expected],
    ]);
  });

  it("keeps an outside-world library out of core and names its package", () => {
    const hashing: FixturePackage = {
      directory: "packages/core/std",
      manifest: manifestFor("@halonicjs/std", "core", {
        dependencies: { "@noble/hashes": "catalog:" },
      }),
      files: {
        "src/index.ts":
          'import { scrypt } from "@noble/hashes/scrypt";\nexport const s = scrypt;\n',
      },
    };
    const messages = runChecks([hashing], { coreOrder: ["@halonicjs/std"] }).map(
      (problem) => problem.message,
    );
    expect(messages.some((message) => message.includes("third-party"))).toBe(true);
    expect(messages.some((message) => message.includes("@halonicjs/adapter-password-scrypt"))).toBe(
      true,
    );
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

  it("lets testing packages use dev tooling such as Vitest outside test files", () => {
    const usesVitest = (directory: string, name: string, layer: Layer): FixturePackage => ({
      directory,
      manifest: manifestFor(name, layer, { devDependencies: { vitest: "catalog:" } }),
      files: { "src/index.ts": 'import { describe } from "vitest";\nexport const d = describe;\n' },
    });
    const spec = usesVitest("packages/testing/spec", "@halonicjs/testing-spec", "testing");
    const adapter = usesVitest("packages/adapters/git", "@halonicjs/adapter-git", "adapters");
    expect(runChecks([spec]).map((problem) => problem.message)).toEqual([]);
    const messages = runChecks([adapter]).map((problem) => problem.message);
    expect(messages.some((message) => message.includes("is dev tooling"))).toBe(true);
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

  it("lets the host use core only: no adapters, no Node APIs and no third-party code", () => {
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
    const usesThirdParty = host(
      { "src/index.ts": 'import { z } from "zod";\nexport const y = z;\n' },
      { zod: "catalog:" },
    );
    const messages = (packages: FixturePackage[]): string[] =>
      runChecks(packages).map((problem) => problem.message);
    expect(messages([usesThirdParty]).some((m) => m.includes('third-party code ("zod")'))).toBe(
      true,
    );
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
