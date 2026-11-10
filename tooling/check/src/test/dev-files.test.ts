import { describe, expect, it } from "vitest";
import type { Layer } from "../lib/layout.ts";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

/** A core package `std` with these files. */
function core(files: Record<string, string>): FixturePackage {
  return {
    directory: "packages/core/std",
    manifest: manifestFor("@halonicjs/std", "core"),
    files: { "src/index.ts": "export const x = 1;\n", ...files },
  };
}

function layerErrors(packages: FixturePackage[]): string[] {
  return runChecks(packages, { coreOrder: ["@halonicjs/std"] })
    .filter((problem) => problem.rule === "layers")
    .map((problem) => `${problem.file}:${problem.line}: ${problem.message}`);
}

const readsFiles = 'import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n';

describe("tooling/check: what counts as test and config code", () => {
  it("treats only config files in the package's own folder as dev code", () => {
    expect(layerErrors([core({ "vitest.config.ts": readsFiles })])).toEqual([]);
    const nested = layerErrors([core({ "src/app.config.ts": readsFiles })]);
    expect(nested).toHaveLength(1);
    expect(nested[0]).toContain("src/app.config.ts:1: core packages may not use Node APIs");
  });

  it("doesn't treat a test/ folder as test code; *.test.* and *.spec.* files are", () => {
    expect(layerErrors([core({ "src/test/helpers.ts": readsFiles })])).toHaveLength(1);
    expect(
      layerErrors([core({ "src/x.test.ts": readsFiles, "src/x.spec.ts": readsFiles })]),
    ).toEqual([]);
  });

  it("fails when non-test code imports a test file", () => {
    const errors = layerErrors([
      core({
        "src/index.ts": 'export { x } from "./helpers.test.ts";\n',
        "src/helpers.test.ts": "export const x = 1;\n",
        "src/other.test.ts": 'import { x } from "./helpers.test.ts";\nexport const y = x;\n',
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("src/index.ts:1:");
    expect(errors[0]).toContain("only tests may import tests");
  });

  it("fails when non-test code imports a tool config file", () => {
    const errors = layerErrors([
      core({
        "src/index.ts": 'export { x } from "../vitest.config.ts";\n',
        "src/bare.ts": 'export { x } from "../vitest.config";\n',
        "src/x.test.ts": 'import { x } from "../vitest.config.ts";\nexport const y = x;\n',
        "vitest.config.ts": 'export { x } from "./src/helpers.test.ts";\n',
        "src/helpers.test.ts": "export const x = 1;\n",
      }),
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("src/bare.ts:1:");
    expect(errors[1]).toContain("src/index.ts:1:");
    expect(errors.every((error) => error.includes("is a tool config file"))).toBe(true);
  });

  it("refuses an export that points at a test file", () => {
    const pkg = core({ "src/index.test.ts": "export const x = 1;\n" });
    const exported = { ...pkg, manifest: { ...pkg.manifest, exports: "./src/index.test.ts" } };
    const problems = runChecks([exported], { coreOrder: ["@halonicjs/std"] });
    expect(problems.map((problem) => problem.message)).toContain(
      '"exports" points at the test file ./src/index.test.ts. Export source files only.',
    );
  });

  it("refuses an export that points at a tool config file", () => {
    const pkg = core({ "vitest.config.ts": "export const x = 1;\n" });
    const exported = {
      ...pkg,
      manifest: { ...pkg.manifest, exports: { ".": "./vitest.config.ts" } },
    };
    const problems = runChecks([exported], { coreOrder: ["@halonicjs/std"] });
    expect(problems.map((problem) => problem.message)).toContain(
      '"exports" points at the tool config file ./vitest.config.ts. Export source files only.',
    );
  });

  it("checks conditional export targets and fallback arrays too", () => {
    const pkg = core({
      "src/x.test.ts": "export const x = 1;\n",
      "vitest.config.ts": "export const x = 1;\n",
    });
    const exports = {
      ".": { types: "./src/index.ts", default: ["./src/x.test.ts", "./vitest.config.ts"] },
    };
    const exported = { ...pkg, manifest: { ...pkg.manifest, exports } };
    const messages = runChecks([exported], { coreOrder: ["@halonicjs/std"] }).map(
      (problem) => problem.message,
    );
    expect(messages).toContain(
      '"exports" points at the test file ./src/x.test.ts. Export source files only.',
    );
    expect(messages).toContain(
      '"exports" points at the tool config file ./vitest.config.ts. Export source files only.',
    );
  });

  it("checks files in generated/ folders like any other code", () => {
    expect(layerErrors([core({ "src/generated/fs.ts": readsFiles })])).toHaveLength(1);
  });

  it("lets every file of a testing package use dev tooling", () => {
    const testing: FixturePackage = {
      directory: "packages/testing/kit",
      manifest: manifestFor("@halonicjs/testing-kit", "testing", {
        devDependencies: { vitest: "catalog:" },
      }),
      files: { "src/index.ts": 'export { expect } from "vitest";\n' },
    };
    expect(runChecks([testing])).toEqual([]);
  });
});

describe("tooling/check: loads the layer check can't follow", () => {
  // Fixture sources aren't type-checked, so they use these globals undeclared.
  const hidden: Record<string, string> = {
    "import(x)": 'const name = "node:fs";\nexport const m = import(name);\n',
    "require(x)": 'const n = "fs";\nexport const m = require(n);\n',
    "require as a value": "export const r = require;\n",
    "require through an object": 'export const fs = globalThis.require("node:fs");\n',
    createRequire: "export const r = module.createRequire;\n",
    getBuiltinModule: 'export const fs = process["getBuiltinModule"]("node:fs");\n',
    "reference types": '/// <reference types="node" />\nexport const x = 1;\n',
    "reference lib": '/// <reference lib="dom" />\nexport const x = 1;\n',
  };

  for (const [what, source] of Object.entries(hidden)) {
    it(`flags ${what} in core`, () => {
      const errors = layerErrors([core({ "src/index.ts": source })]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("so the layer check can't follow it");
    });
  }

  it("flags them in host and Studio packages, but not in tests or adapters", () => {
    const source = hidden["import(x)"] ?? "";
    const at = (directory: string, name: string, layer: Layer, extra = {}): FixturePackage => ({
      directory,
      manifest: manifestFor(name, layer, extra),
      files: { "src/index.ts": source, "src/index.test.ts": source },
    });
    const errors = layerErrors([
      at("packages/host/server", "@halonicjs/host-server", "host"),
      at("packages/studio/shell", "@halonicjs/studio-shell", "studio"),
      at("packages/adapters/fs-node", "@halonicjs/adapter-fs-node", "adapters", {
        halonic: { layer: "adapters", owner: "mateo", runtime: "node" },
      }),
    ]);
    expect(errors.map((error) => error.split(":")[0])).toEqual([
      "packages/host/server/src/index.ts",
      "packages/studio/shell/src/index.ts",
    ]);
  });

  it("allows literal imports, including import attributes", () => {
    const source =
      'export const a = import("./b.ts");\nexport const c = import("./d.json", { with: { type: "json" } });\n';
    const errors = layerErrors([
      core({ "src/index.ts": source, "src/b.ts": "export {};\n", "src/d.json": "{}\n" }),
    ]);
    expect(errors).toEqual([]);
  });
});
