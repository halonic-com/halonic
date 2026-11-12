import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { cloudAffectedFiles, inputsHash, liveInputPaths } from "./cloud-paths.ts";
import type { WorkspacePackage } from "./workspace.ts";

function workspacePackage(
  directory: string,
  name: string,
  dependencies: Record<string, string> = {},
): WorkspacePackage {
  return { directory, manifestPath: `${directory}/package.json`, manifest: { name, dependencies } };
}

verifies("check.cloud-affected", () => {
  describe("cloudAffectedFiles", () => {
    test.each([
      "packages/adapters/cloudflare-r2/src/store.ts",
      "packages/adapters/store-s3/package.json",
      "packages/targets/cloudflare/deploy/src/deploy.ts",
      "packages/host/server/src/handler.ts",
      "packages/core/ports/src/blob-store.ts",
      "packages/testing/contracts/target/live/r2.test.ts",
      "apps/cli/src/commands/deploy/plan.ts",
      ".github/workflows/live-cloud.yml",
      "tooling/check/src/cli/live-sweep.ts",
    ])("answers yes for %s", (file) => {
      expect(cloudAffectedFiles(["README.md", file])).toEqual([file]);
    });

    test.each([
      "packages/core/format/src/deployments.ts",
      "packages/adapters/fs-node/src/store.ts",
      "apps/cli/src/commands/run/run.ts",
      ".github/workflows/ci.yml",
      "tooling/check/src/cli/pr-title.ts",
    ])("answers no for %s", (file) => {
      expect(cloudAffectedFiles([file])).toEqual([]);
    });
  });

  describe("liveInputPaths", () => {
    const packages = [
      workspacePackage(".", "@halonicjs/root"),
      workspacePackage("packages/adapters/cloudflare-r2", "@halonicjs/cloudflare-r2", {
        "@halonicjs/ports": "workspace:*",
        zod: "catalog:",
      }),
      workspacePackage("packages/core/ports", "@halonicjs/ports", {
        "@halonicjs/events": "workspace:*",
      }),
      workspacePackage("packages/core/events", "@halonicjs/events"),
      workspacePackage("packages/core/format", "@halonicjs/format"),
    ];

    test("takes the cloud packages, their workspace dependencies and the workspace setup", () => {
      const files = [
        "packages/adapters/cloudflare-r2/src/store.ts",
        "packages/core/format/src/deployments.ts",
        ".github/workflows/live-cloud.yml",
      ];
      expect(liveInputPaths(files, packages)).toEqual([
        ".github/actions/setup",
        ".github/workflows/live-cloud.yml",
        "package.json",
        "packages/adapters/cloudflare-r2",
        "packages/core/events",
        "packages/core/ports",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
      ]);
    });

    test("is only the workspace setup while there are no cloud paths", () => {
      expect(liveInputPaths(["packages/core/format/src/a.ts"], packages)).toEqual([
        ".github/actions/setup",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
      ]);
    });
  });

  describe("inputsHash", () => {
    const a = "100644 blob 1111\tpackages/core/ports/a.ts";
    const b = "100644 blob 2222\tpnpm-lock.yaml";

    test("doesn't depend on the order of the lines", () => {
      expect(inputsHash([a, b])).toBe(inputsHash([b, a]));
    });

    test("changes when a file changes", () => {
      expect(inputsHash([a, b])).not.toBe(inputsHash([a, b.replace("2222", "3333")]));
    });
  });
});
