import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { requireMatchingVersions } from "./versions.ts";
import { findLayers, type LayerConfig } from "./workspace.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function layer(name: string, version: string, dependencies = {}): LayerConfig {
  return {
    layer: name.replace("@halonicjs/", ""),
    directory: `tooling/publish/layers/${name.replace("@halonicjs/", "")}`,
    name,
    version,
    description: "A layer.",
    dependencies,
    peerDependencies: {},
  };
}

const adapters = layer("@halonicjs/adapters", "0.1.0");

function testing(version: string, adaptersRange: string): LayerConfig {
  return layer("@halonicjs/testing", version, {
    "@halonicjs/adapters": adaptersRange,
    zod: "4.6.7",
  });
}

verifies("publish.matching-versions", () => {
  describe("the published versions", () => {
    it("accepts @halonicjs/testing at the adapters' version that pins them exactly", () => {
      const config = testing("0.1.0", "0.1.0");
      expect(() =>
        requireMatchingVersions(config, ["@halonicjs/adapters"], [adapters, config]),
      ).not.toThrow();
    });

    it("refuses @halonicjs/testing whose version differs from the adapters'", () => {
      const config = testing("0.2.0", "0.2.0");
      expect(() =>
        requireMatchingVersions(config, ["@halonicjs/adapters"], [adapters, config]),
      ).toThrow(/is 0\.2\.0 but @halonicjs\/adapters is 0\.1\.0/);
    });

    it("refuses a range where an exact version belongs", () => {
      const config = testing("0.1.0", "^0.1.0");
      expect(() =>
        requireMatchingVersions(config, ["@halonicjs/adapters"], [adapters, config]),
      ).toThrow(/"\^0\.1\.0"\. Published dependencies are exact versions/);
    });

    it("refuses an import of a package no layer publishes", () => {
      const config = testing("0.1.0", "0.1.0");
      expect(() => requireMatchingVersions(config, ["@halonicjs/adapters"], [config])).toThrow(
        /no layer package publishes it/,
      );
    });

    it("holds for the layer packages in this repo", () => {
      const layers = findLayers(root);
      expect(layers.map((config) => config.name).sort()).toEqual([
        "@halonicjs/adapters",
        "@halonicjs/testing",
      ]);
      for (const config of layers) {
        const imported = Object.keys(config.dependencies).filter((name) =>
          name.startsWith("@halonicjs/"),
        );
        expect(() => requireMatchingVersions(config, imported, layers)).not.toThrow();
      }
    });
  });
});
