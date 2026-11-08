import { describe, expect, it } from "vitest";
import { type PackageSpec, packageFiles, presetFor } from "./templates.ts";

const core: PackageSpec = {
  directory: "packages/core/std",
  name: "@halonicjs/std",
  layer: "core",
  owner: "elena",
  isFeature: false,
  folder: "std",
};

describe("packageFiles", () => {
  it("writes a private package with its layer, owner and catalog versions", () => {
    const manifest = JSON.parse(packageFiles(core)["package.json"] ?? "{}");
    expect(manifest).toMatchObject({
      name: "@halonicjs/std",
      private: true,
      exports: { ".": "./src/index.ts" },
      halonic: { layer: "core", owner: "elena", coverage: { lines: 90, branches: 85 } },
      devDependencies: { typescript: "catalog:", "@halonicjs/tooling-config": "workspace:*" },
    });
  });

  it("uses the core preset for core source and the Node preset for tests", () => {
    const files = packageFiles(core);
    expect(files["tsconfig.json"]).toContain("tsconfig/core.json");
    expect(files["tsconfig.test.json"]).toContain("tsconfig/node.json");
  });

  it("gives a feature its ./api entry and a feature object", () => {
    const files = packageFiles({
      ...core,
      directory: "packages/studio/features/inbox",
      name: "@halonicjs/studio-feature-inbox",
      layer: "studio",
      isFeature: true,
      folder: "inbox",
    });
    expect(JSON.parse(files["package.json"] ?? "{}").exports).toEqual({
      ".": "./src/index.ts",
      "./api": "./src/api.ts",
    });
    expect(files["src/feature.ts"]).toContain("export const inboxFeature");
  });

  it("writes the coverage floor of the package's layer", () => {
    const files = packageFiles({ ...core, layer: "adapters" });
    expect(JSON.parse(files["package.json"] ?? "{}").halonic.coverage).toEqual({ lines: 80 });
  });

  it("writes an adapter's runtime into package.json and its README", () => {
    const files = packageFiles({
      ...core,
      directory: "packages/adapters/fs-node",
      name: "@halonicjs/adapter-fs-node",
      layer: "adapters",
      folder: "fs-node",
      runtime: "node",
    });
    expect(JSON.parse(files["package.json"] ?? "{}").halonic).toEqual({
      layer: "adapters",
      owner: "elena",
      coverage: { lines: 80 },
      runtime: "node",
    });
    expect(files["README.md"]).toContain("**Runtime:** node");
    expect(JSON.parse(packageFiles(core)["package.json"] ?? "{}").halonic).not.toHaveProperty(
      "runtime",
    );
  });
});

describe("presetFor", () => {
  const spec: PackageSpec = { ...core, layer: "adapters" };
  it.each<[PackageSpec, string]>([
    [{ ...spec, runtime: "node" }, "node"],
    [{ ...spec, runtime: "web" }, "web"],
    [{ ...spec, runtime: "workers" }, "host"],
    [{ ...spec, runtime: "any" }, "host"],
    [{ ...core, layer: "host" }, "host"],
    [{ ...core, layer: "targets", target: { name: "node", kind: "runtime" } }, "node"],
    [{ ...core, layer: "targets", target: { name: "cloudflare", kind: "runtime" } }, "host"],
    [{ ...core, layer: "targets", target: { name: "cloudflare", kind: "deploy" } }, "node"],
    [{ ...core, layer: "studio" }, "studio"],
    [core, "core"],
  ])("picks the preset for %o", (input, preset) => {
    expect(presetFor(input)).toBe(preset);
  });
});
