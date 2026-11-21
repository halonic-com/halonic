import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  docsReaders,
  selectedFolders,
  selectTests,
  testSelection,
  verifierPackages,
} from "./affected-tests.ts";
import type { CheckContext } from "./context.ts";
import { isTestFile } from "./source-files.ts";
import {
  findRepoRoot,
  listRepoFiles,
  listWorkspacePackages,
  owningPackage,
  type WorkspacePackage,
} from "./workspace.ts";

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

/** Each doc a test reads by a path out of its package, with the readers' packages. */
function docsReadByTests(root: string): Map<string, Set<string>> {
  const repoPackages = listWorkspacePackages(root);
  const reads = /(?:(?:\.\.\/)+|findRepoRoot\(\),\s*["'`])(docs\/[\w./-]+\.md)/g;
  const found = new Map<string, Set<string>>();
  for (const file of listRepoFiles(root).filter(isTestFile)) {
    const reader = owningPackage(file, repoPackages)?.manifest.name ?? file;
    for (const [, doc = ""] of readFileSync(join(root, file), "utf8").matchAll(reads)) {
      found.set(doc, new Set([...(found.get(doc) ?? []), reader]));
    }
  }
  return found;
}

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

    test("selects the publish tests for the published code, not for a test file there", () => {
      const withPublish = [
        ...packages,
        workspacePackage("tooling/publish", "@halonicjs/tooling-publish"),
        workspacePackage("apps/studio", "@halonicjs/studio"),
      ];
      expect(testSelection(["packages/core/format/src/a.ts"], withPublish)).toEqual({
        kind: "some",
        packages: ["@halonicjs/format", "@halonicjs/tooling-publish"],
      });
      expect(testSelection(["packages/core/format/src/a.test.ts"], withPublish)).toEqual({
        kind: "some",
        packages: ["@halonicjs/format"],
      });
      expect(testSelection(["apps/cli/src/main.ts"], withPublish)).toEqual({
        kind: "some",
        packages: ["@halonicjs/tooling-publish", "halonic"],
      });
      expect(testSelection(["apps/cli/src/main.test.ts"], withPublish)).toEqual({
        kind: "some",
        packages: ["halonic"],
      });
      expect(testSelection(["examples/acme/workspace.yaml"], withPublish)).toEqual({
        kind: "some",
        packages: [
          "@halonicjs/test-runner",
          "@halonicjs/tooling-publish",
          "@halonicjs/workspace",
          "halonic",
        ],
      });
      expect(testSelection(["apps/studio/src/main.ts"], withPublish)).toEqual({
        kind: "some",
        packages: ["@halonicjs/studio"],
      });
    });

    test("selects a package whose tests verify a changed package's requirements", () => {
      const verifiers = new Map([["@halonicjs/format", ["@halonicjs/workspace"]]]);
      expect(testSelection(["packages/core/format/src/a.ts"], packages, verifiers)).toEqual({
        kind: "some",
        packages: [
          "@halonicjs/format",
          "@halonicjs/test-runner",
          "@halonicjs/workspace",
          "halonic",
        ],
      });
    });

    test("selects the packages whose tests read a changed doc", () => {
      expect(testSelection(["docs/guides/integrations.md"], packages)).toEqual({
        kind: "some",
        packages: ["@halonicjs/format"],
      });
    });

    test("counts a README inside a package as a change to that package", () => {
      expect(testSelection(["packages/core/format/README.md"], packages)).toEqual({
        kind: "some",
        packages: ["@halonicjs/format"],
      });
    });
  });

  describe("verifierPackages", () => {
    test("maps a package to the packages whose tests verify its requirements", () => {
      const source = `import { verifies } from "@halonicjs/testing-spec";\nverifies("format.round-trip", () => {});\n`;
      const files: Record<string, string> = {
        "packages/core/format/requirements/round-trip.md": "# format.round-trip\n",
        "packages/core/format/src/a.test.ts": source,
        "apps/cli/src/format.test.ts": source,
        "packages/core/workspace/src/w.test.ts": source,
      };
      const context = {
        files: Object.keys(files),
        packages,
        read: (file: string) => files[file] ?? "",
      };
      expect(verifierPackages(context)).toEqual(
        new Map([["@halonicjs/format", ["halonic", "@halonicjs/workspace"]]]),
      );
    });

    test("keeps the links of a requirement the change deletes", () => {
      const files: Record<string, string> = {
        "apps/cli/src/format.test.ts": `import { verifies } from "@halonicjs/testing-spec";\nverifies("format.round-trip", () => {});\n`,
      };
      const context = {
        files: Object.keys(files),
        packages,
        read: (file: string) => files[file] ?? "",
      };
      expect(verifierPackages(context)).toEqual(new Map());
      const changed = ["packages/core/format/requirements/round-trip.md"];
      expect(verifierPackages(context, changed)).toEqual(
        new Map([["@halonicjs/format", ["halonic"]]]),
      );
    });
  });

  // Reads the real repo: a test that reads a doc outside its own package
  // must be listed in docsReaders, or a change to that doc tests nothing.
  test("docsReaders lists every doc a test reads, with that test's package", () => {
    const root = findRepoRoot();
    const found = docsReadByTests(root);
    expect(found.size).toBeGreaterThan(0);
    for (const [doc, readers] of found) {
      expect(new Set(docsReaders[doc] ?? []), doc).toEqual(readers);
    }
    for (const doc of Object.keys(docsReaders)) {
      expect(existsSync(join(root, doc)), doc).toBe(true);
    }
  });

  describe("selectTests", () => {
    test("selects every package when git can't list the changes", () => {
      const root = mkdtempSync(join(tmpdir(), "affected-tests-"));
      try {
        const context = { root, files: [], packages, read: () => "" } as unknown as CheckContext;
        const selection = selectTests(context, "no-such-commit");
        expect(selection.kind).toBe("all");
        expect(selectedFolders(selection, packages)).toBeUndefined();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  test("selectedFolders gives the selected packages' folders", () => {
    const selection = testSelection(["packages/core/ports/src/blob-store.ts"], packages);
    expect(selectedFolders(selection, packages)).toEqual(
      new Set(["packages/core/ports", "packages/adapters/fs-node"]),
    );
  });
});
