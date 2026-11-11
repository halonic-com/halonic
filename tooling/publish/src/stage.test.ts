import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { rewriteSpecifiers } from "./specifiers.ts";
import { aliasedEntryFile, layerSubpaths, requireDeclaredImports, stageLayer } from "./stage.ts";
import type { LayerConfig, WorkspacePackage } from "./workspace.ts";

const scratch = mkdtempSync(join(tmpdir(), "stage-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const layers = join(root, "tooling/publish/layers");

verifies("publish.staged-package", () => {
  it("stages @halonicjs/adapters with only the kit's integration entry and no unpublished package inside", () => {
    const staged = stageLayer(root, join(layers, "adapters"), join(scratch, "adapters"));
    const manifest = JSON.parse(readFileSync(join(staged.directory, "package.json"), "utf8"));
    expect(manifest.name).toBe("@halonicjs/adapters");
    expect(manifest.dependencies).toEqual({});
    expect(manifest.description).toContain("runTool");
    expect(manifest.repository.directory).toBe("packages/adapters");
    expect(readFileSync(join(staged.directory, "README.md"), "utf8")).toMatch(
      /^# @halonicjs\/adapters\n/,
    );
    expect(Object.keys(manifest.exports)).toEqual(["./integration-kit"]);
    expect(manifest.exports["./integration-kit"].default).toBe(
      "./dist/adapters/integration-kit/src/integration/index.js",
    );

    const imported = new Set<string>();
    for (const file of readdirSync(join(staged.directory, "dist"), {
      recursive: true,
      encoding: "utf8",
    })) {
      if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
      rewriteSpecifiers(readFileSync(join(staged.directory, "dist", file), "utf8"), (specifier) => {
        if (!specifier.startsWith(".") && !specifier.startsWith("node:")) imported.add(specifier);
        return undefined;
      });
    }
    expect([...imported].filter((name) => name.startsWith("@halonicjs/"))).toEqual([]);
    expect(readdirSync(join(staged.directory, "dist/adapters/integration-kit/src")).sort()).toEqual(
      ["integration"],
    );
  }, 120_000);

  it("names the published kit in @halonicjs/testing, which depends on @halonicjs/adapters", () => {
    const staged = stageLayer(root, join(layers, "testing"), join(scratch, "testing"));
    const manifest = JSON.parse(readFileSync(join(staged.directory, "package.json"), "utf8"));
    expect(manifest.name).toBe("@halonicjs/testing");
    expect(Object.keys(manifest.exports)).toEqual(["./integration"]);
    expect(manifest.dependencies["@halonicjs/adapters"]).toBe(manifest.version);
    const hostSide = join(staged.directory, "dist/adapters/integration-kit/src");
    const limitedHttp = readFileSync(join(hostSide, "limited-http.js"), "utf8");
    expect(limitedHttp).toContain('from "@halonicjs/adapters/integration-kit"');
    expect(readdirSync(hostSide)).not.toContain("integration");
    const checks = readFileSync(
      join(staged.directory, "dist/testing/integration/src/checks.js"),
      "utf8",
    );
    expect(checks).toContain('from "../../../adapters/integration-kit/src/index.js"');
    expect(checks).not.toContain("adapter-integration-kit");
  }, 120_000);
});

verifies("publish.staged-package", () => {
  it("fails on an import the package does not declare", () => {
    const distribution = mkdtempSync(join(tmpdir(), "stage-test-"));
    try {
      writeFileSync(join(distribution, "a.js"), 'import { pad } from "left-pad";\n');
      const config = { name: "@acme/thing", dependencies: {}, peerDependencies: {} };
      expect(() => requireDeclaredImports(distribution, config)).toThrow(
        /a\.js imports "left-pad"/,
      );
    } finally {
      rmSync(distribution, { recursive: true, force: true });
    }
  });
});

verifies("publish.staged-package", () => {
  const thing: WorkspacePackage = {
    name: "@acme/thing",
    directory: "/repo/packages/core/thing",
    entries: new Map([
      [".", "/repo/packages/core/thing/src/index.ts"],
      ["./integration", "/repo/packages/core/thing/src/integration/index.ts"],
    ]),
    published: undefined,
  };

  it("leaves out a published entry that has a folder of its own", () => {
    expect(aliasedEntryFile("@acme/thing/integration", [thing], "@acme/suite")).toBe(
      "/repo/packages/core/thing/src/integration/index.ts",
    );
  });

  it("refuses to leave out a root entry, whose folder holds the other entries", () => {
    expect(() => aliasedEntryFile("@acme/thing", [thing], "@acme/suite")).toThrow(
      /published entry "@acme\/thing" can't be left out of the tarball, because its folder also holds @acme\/thing\/integration/,
    );
  });

  it("refuses a published entry that names no workspace entry", () => {
    expect(() => aliasedEntryFile("@acme/other", [thing], "@acme/suite")).toThrow(
      /published entry "@acme\/other" is no workspace package entry/,
    );
  });
});

verifies("publish.staged-package", () => {
  const adapters: LayerConfig = {
    layer: "adapters",
    directory: "/repo/tooling/publish/layers/adapters",
    name: "@halonicjs/adapters",
    version: "0.1.0",
    description: "Adapters.",
    dependencies: {},
    peerDependencies: {},
  };
  const piece = (folder: string, publishedAs: string): WorkspacePackage => ({
    name: `@halonicjs/${folder.replace("/", "-")}`,
    directory: `/repo/packages/${folder}`,
    entries: new Map([[".", `/repo/packages/${folder}/src/index.ts`]]),
    published: { name: publishedAs, entry: "." },
  });

  it("makes each package that names the layer package one subpath of it", () => {
    const workspace = [
      piece("adapters/kit", "@halonicjs/adapters/kit"),
      piece("adapters/main", "@halonicjs/adapters"),
      piece("testing/suite", "@halonicjs/testing/suite"),
      { ...piece("adapters/private", "@halonicjs/adapters/x"), published: undefined },
    ];
    expect(layerSubpaths(adapters, workspace, "/repo")).toEqual([
      {
        subpath: ".",
        file: "/repo/packages/adapters/main/src/index.ts",
        packageDirectory: "/repo/packages/adapters/main",
      },
      {
        subpath: "./kit",
        file: "/repo/packages/adapters/kit/src/index.ts",
        packageDirectory: "/repo/packages/adapters/kit",
      },
    ]);
  });

  it("refuses a package of another layer folder", () => {
    expect(() =>
      layerSubpaths(adapters, [piece("testing/suite", "@halonicjs/adapters/suite")], "/repo"),
    ).toThrow(/only packages in packages\/adapters belong to @halonicjs\/adapters/);
  });

  it("refuses two packages on one subpath", () => {
    const workspace = [
      piece("adapters/one", "@halonicjs/adapters/kit"),
      piece("adapters/two", "@halonicjs/adapters/kit"),
    ];
    expect(() => layerSubpaths(adapters, workspace, "/repo")).toThrow(
      /the subpath "\.\/kit" is published by two packages/,
    );
  });

  it("refuses a layer package with no subpaths", () => {
    expect(() => layerSubpaths(adapters, [], "/repo")).toThrow(/has no subpaths/);
  });
});

verifies("publish.staged-package", () => {
  it("takes the outside dependency versions from the catalog", () => {
    const catalog = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    for (const layer of ["adapters", "testing"]) {
      const config = JSON.parse(readFileSync(join(layers, layer, "layer.json"), "utf8"));
      for (const [name, range] of Object.entries(config.dependencies)) {
        if (name.startsWith("@halonicjs/")) continue;
        const pinned = new RegExp(`^  ${name}: (\\S+)$`, "m").exec(catalog)?.[1];
        expect(range, `${layer}: ${name}`).toBe(pinned);
      }
    }
  });
});
