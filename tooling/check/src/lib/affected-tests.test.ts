import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { testSelection } from "./affected-tests.ts";
import type { WorkspacePackage } from "./workspace.ts";

function workspacePackage(
  directory: string,
  name: string,
  dependencies: Record<string, string> = {},
): WorkspacePackage {
  return { directory, manifestPath: `${directory}/package.json`, manifest: { name, dependencies } };
}

const packages = [
  workspacePackage(".", "@halonicjs/root"),
  workspacePackage("packages/core/events", "@halonicjs/events"),
  workspacePackage("packages/core/ports", "@halonicjs/ports", {
    "@halonicjs/events": "workspace:*",
  }),
  workspacePackage("packages/adapters/fs-node", "@halonicjs/adapter-fs-node", {
    "@halonicjs/ports": "workspace:*",
    zod: "catalog:",
  }),
  workspacePackage("packages/core/workspace", "@halonicjs/workspace"),
  workspacePackage("packages/core/test-runner", "@halonicjs/test-runner", {
    "@halonicjs/workspace": "workspace:*",
  }),
  workspacePackage("apps/cli", "halonic", { "@halonicjs/test-runner": "workspace:*" }),
  workspacePackage("packages/core/format", "@halonicjs/format"),
];

verifies("check.affected-tests", () => {
  describe("testSelection", () => {
    test("selects the changed package and every package that depends on it", () => {
      expect(testSelection(["packages/core/ports/src/blob-store.ts"], packages)).toEqual({
        kind: "some",
        packages: ["@halonicjs/adapter-fs-node", "@halonicjs/ports"],
      });
    });

    test("follows dependents more than one level up", () => {
      expect(testSelection(["packages/core/events/src/event.ts"], packages)).toEqual({
        kind: "some",
        packages: ["@halonicjs/adapter-fs-node", "@halonicjs/events", "@halonicjs/ports"],
      });
    });

    test.each([
      "pnpm-lock.yaml",
      "package.json",
      "pnpm-workspace.yaml",
      "turbo.json",
      "biome.json",
      "tooling/config/tsconfig/base.json",
      "tooling/check/src/cli/pr-title.ts",
      "packages/testing/spec/src/verifies.ts",
      ".github/workflows/ci.yml",
      ".github/actions/setup/action.yml",
      "patches/vitest.patch",
    ])("selects every package for %s", (file) => {
      const selection = testSelection(["packages/core/format/src/a.ts", file], packages);
      expect(selection.kind).toBe("all");
    });

    test("selects every package for a file outside every package that isn't docs", () => {
      expect(testSelection(["infra/turbo-cache/src/worker.ts"], packages)).toEqual({
        kind: "all",
        reason: "infra/turbo-cache/src/worker.ts is outside every package, so any test may read it",
      });
    });

    test("selects every package when no changed file was found", () => {
      expect(testSelection([], packages).kind).toBe("all");
    });

    test.each([
      "docs/guides/review.md",
      "decisions/mateo/HAL-1-example.md",
      ".changeset/quiet-fox.md",
      ".github/CODEOWNERS",
      "README.md",
      "AGENTS.md",
    ])("selects no package for %s", (file) => {
      expect(testSelection([file], packages)).toEqual({ kind: "some", packages: [] });
    });

    test("selects the packages that read examples/ for a change there", () => {
      expect(testSelection(["examples/acme/workflows/hello.yaml"], packages)).toEqual({
        kind: "some",
        packages: ["@halonicjs/test-runner", "@halonicjs/workspace", "halonic"],
      });
    });

    test("counts a README inside a package as a change to that package", () => {
      expect(testSelection(["packages/core/format/README.md"], packages)).toEqual({
        kind: "some",
        packages: ["@halonicjs/format"],
      });
    });
  });
});
