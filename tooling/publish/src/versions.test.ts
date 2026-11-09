import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { requireMatchingVersions } from "./versions.ts";
import {
  findWorkspacePackages,
  type PublishConfig,
  readJson,
  readPublishConfig,
  type WorkspacePackage,
} from "./workspace.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const kit: WorkspacePackage = {
  name: "@halonicjs/adapter-integration-kit",
  directory: "packages/adapters/integration-kit",
  entries: new Map(),
  version: "0.1.0",
  publishedName: "@halonicjs/integration-kit",
};

function suiteConfig(kitRange: string): PublishConfig {
  return {
    name: "@halonicjs/testing-integration",
    entry: ".",
    description: undefined,
    aliases: { "@halonicjs/adapter-integration-kit/integration": "@halonicjs/integration-kit" },
    dependencies: { "@halonicjs/integration-kit": kitRange, zod: "4.6.7" },
    peerDependencies: { vitest: "^5.1.0" },
  };
}

verifies("publish.matching-versions", () => {
  describe("the published versions", () => {
    it("accepts a suite at the kit's version that pins the kit exactly", () => {
      expect(() => requireMatchingVersions("0.1.0", suiteConfig("0.1.0"), [kit])).not.toThrow();
    });

    it("refuses a suite whose version differs from the kit's", () => {
      expect(() => requireMatchingVersions("0.2.0", suiteConfig("0.2.0"), [kit])).toThrow(
        /is 0\.2\.0 but @halonicjs\/integration-kit is 0\.1\.0/,
      );
    });

    it("refuses a range where an exact version belongs", () => {
      expect(() => requireMatchingVersions("0.1.0", suiteConfig("^0.1.0"), [kit])).toThrow(
        /"\^0\.1\.0"\. Published dependencies are exact versions/,
      );
    });

    it("refuses an alias of a package no workspace package publishes", () => {
      expect(() => requireMatchingVersions("0.1.0", suiteConfig("0.1.0"), [])).toThrow(
        /no workspace package publishes it/,
      );
    });

    it("holds for the kit and the suite in this repo", () => {
      const workspace = findWorkspacePackages(root);
      for (const folder of ["packages/adapters/integration-kit", "packages/testing/integration"]) {
        const manifest = readJson(join(root, folder, "package.json"));
        const version = String(manifest["version"]);
        expect(() =>
          requireMatchingVersions(version, readPublishConfig(manifest), workspace),
        ).not.toThrow();
      }
    });
  });
});
