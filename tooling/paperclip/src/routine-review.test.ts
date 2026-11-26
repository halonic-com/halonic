import { globSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  isLiamPath,
  type RoutedPull,
  reviewerFor,
  reviewerRoleFor,
  routineRefusal,
} from "./reviewer-paths.ts";
import {
  isPublicInterface,
  isRoutineExcluded,
  sensitiveOrigin,
  writtenByTeam,
} from "./reviewer-paths-routine.ts";

/** A pull request with these files and this many changed lines, none of them sensitive. */
function pullOf(files: readonly string[], changedLines = 40): RoutedPull {
  return { files, changedLines, sensitive: false, ours: true };
}

verifies("paperclip.routine-review", () => {
  test.each([
    ["packages/studio/features/inbox/src/view.tsx"],
    ["apps/cli/src/commands/run.ts"],
    ["packages/adapters/fs-node/src/read.ts"],
    ["docs/guides/review.md"],
    ["packages/studio/features/inbox/src/view.test.tsx", ".changeset/inbox-label.md"],
    ["tooling/paperclip/src/pr-watcher/watch.ts"],
  ])("%s is a routine review", (...files) => {
    expect(routineRefusal(pullOf(files))).toBeNull();
    expect(reviewerRoleFor(pullOf(files))).toBe("routine-reviewer");
  });

  test.each([
    ["packages/core/app/src/a.ts", "touches packages/core/app/src/a.ts"],
    ["packages/core/app/src/a.test.ts", "touches packages/core/app/src/a.test.ts"],
    ["packages/host/server/src/a.ts", "touches packages/host/server/src/a.ts"],
    ["packages/testing/spec/src/a.ts", "touches packages/testing/spec/src/a.ts"],
    [
      "packages/studio/features/inbox/src/index.ts",
      "changes a public interface (packages/studio/features/inbox/src/index.ts)",
    ],
  ])("%s stays with the second reviewer: %s", (file, reason) => {
    expect(routineRefusal(pullOf([file]))).toBe(reason);
    expect(reviewerRoleFor(pullOf([file]))).toBe("second-reviewer");
  });

  test("a package.json the second reviewer may approve is routine; a new package isn't", () => {
    const path = "packages/studio/features/inbox/package.json";
    const manifest = JSON.stringify({ name: "@halonicjs/acme", version: "0.1.0" });
    const after = manifest.replace("}", ',"description":"Inbox"}');
    const changed = { ...pullOf([path]), manifests: { [path]: { before: manifest, after } } };
    expect(routineRefusal(changed)).toBeNull();
    for (const field of ["main", "module", "types"]) {
      const entry = manifest.replace("}", `,"${field}":"b.js"}`);
      const moved = {
        ...pullOf([path]),
        manifests: { [path]: { before: manifest, after: entry } },
      };
      expect(routineRefusal(moved)).toBe(`changes a public interface (${path})`);
    }
    const added = { ...pullOf([path]), manifests: { [path]: { before: null, after } } };
    expect(reviewerRoleFor(added)).toBe("code-reviewer");
  });

  test("a pull request outside Julian's limits is never routine", () => {
    for (const pull of [
      pullOf([".github/workflows/ci.yml"]),
      pullOf(["packages/x/src/sandbox/fence.ts"]),
      { ...pullOf(["apps/cli/src/a.ts"]), sensitive: true },
      pullOf(["apps/cli/src/a.ts"], 1501),
      pullOf(["tooling/paperclip/src/merge-control/approval.ts"]),
      pullOf(["tooling/paperclip/src/reviewer-paths/routine.ts"]),
    ]) {
      expect(routineRefusal(pull)).toBe("outside the second reviewer's limits");
      expect(reviewerRoleFor(pull)).toBe("code-reviewer");
    }
  });

  test("the routine reviewer has the second reviewer's size limit", () => {
    expect(routineRefusal(pullOf(["apps/cli/src/a.ts"], 1500))).toBeNull();
  });

  test("Nora covers routine reviews", () => {
    expect(reviewerFor(pullOf(["apps/cli/src/commands/run.ts"]))).toBe("nora");
  });
});

verifies("paperclip.routine-review", () => {
  test.each([
    [
      "packages/studio/features/inbox/src/api.ts",
      "changes a public interface (packages/studio/features/inbox/src/api.ts)",
    ],
    [
      "packages/adapters/harness-codex/src/web.ts",
      "changes a public interface (packages/adapters/harness-codex/src/web.ts)",
    ],
    ["tooling/config/biome.jsonc", "touches tooling/config/biome.jsonc"],
    [".gitattributes", "touches .gitattributes"],
    ["AGENTS.md", "touches AGENTS.md"],
    ["CLAUDE.md", "touches CLAUDE.md"],
    ["CONTRIBUTING.md", "touches CONTRIBUTING.md"],
    ["LICENSE", "touches LICENSE"],
    ["NOTICE", "touches NOTICE"],
    ["docs/legal/dco-standing-statement.md", "touches docs/legal/dco-standing-statement.md"],
    [
      "packages/studio/kit/src/fonts/LICENSE.txt",
      "touches packages/studio/kit/src/fonts/LICENSE.txt",
    ],
  ])("%s refuses the routine role: %s", (file, reason) => {
    expect(routineRefusal(pullOf([file]))).toBe(reason);
    expect(reviewerRoleFor(pullOf([file]))).toBe("second-reviewer");
  });

  test("a package's own AGENTS.md stays routine", () => {
    expect(routineRefusal(pullOf(["apps/cli/AGENTS.md"]))).toBeNull();
  });

  test("a change to a package's exports refuses the routine role", () => {
    const path = "packages/studio/features/inbox/package.json";
    const before = JSON.stringify({ name: "@halonicjs/acme", exports: { ".": "./src/index.ts" } });
    const after = before.replace("}}", ',"./web":"./src/web.ts"}}');
    const pull = { ...pullOf([path]), manifests: { [path]: { before, after } } };
    expect(routineRefusal(pull)).toBe(`changes a public interface (${path})`);
  });

  test.each([
    "tooling/paperclip/src/merge-control/gate.ts",
    "tooling/paperclip/src/merge-control/write-client.ts",
    "tooling/paperclip/src/merge-control/checks.test.ts",
    "tooling/paperclip/src/plugin/manifest.ts",
    "tooling/paperclip/src/seats/plugin/manifest.ts",
    ".claude/settings.json",
    ".mcp.json",
    ".npmrc",
    ".pnpmfile.cjs",
    "packages/adapters/fs-node/src/sandbox/fence.test.ts",
    "docs/guides/trust.md",
  ])("Julian's list on HAL-18424 keeps %s from the routine role", (file) => {
    expect(isRoutineExcluded(file)).toBe(true);
    expect(routineRefusal(pullOf([file]))).not.toBeNull();
  });

  test.each([
    ".changeset/inbox-label.md",
    "apps/cli/src/messages/sandbox.ts",
    "apps/cli/src/plugin/load.ts",
  ])("%s stays routine", (file) => {
    expect(routineRefusal(pullOf([file]))).toBeNull();
  });

  test("a pull request the team didn't write is never routine", () => {
    const files = ["apps/cli/src/commands/run.ts"];
    expect(routineRefusal({ files, changedLines: 2, sensitive: false })).toBe(
      "not written by the team",
    );
    expect(reviewerFor({ files, changedLines: 2, sensitive: false, ours: false })).toBe("julian");
    const ours = { branch: "mateo/HAL-5701-work", crossRepository: false, labels: [] };
    expect(writtenByTeam(ours)).toBe(true);
    expect(writtenByTeam({ ...ours, crossRepository: true })).toBe(false);
    expect(writtenByTeam({ ...ours, branch: "dependabot/npm_and_yarn/acme-1.2.3" })).toBe(false);
    expect(writtenByTeam({ ...ours, branch: "fix-typo" })).toBe(false);
  });

  test("a release branch or the trust label makes a pull request sensitive", () => {
    const plain = { branch: "mateo/HAL-5701-work", crossRepository: false, labels: [] };
    expect(sensitiveOrigin(plain)).toBe(false);
    expect(sensitiveOrigin({ ...plain, branch: "changeset-release/main" })).toBe(true);
    expect(sensitiveOrigin({ ...plain, branch: "release/0.2.0" })).toBe(true);
    expect(sensitiveOrigin({ ...plain, labels: ["area: trust and sandbox"] })).toBe(true);
  });

  test("a renamed file counts by its old path too", () => {
    const moved = "tooling/paperclip/src/routing/reviewer-paths.ts";
    const out = (old: string | null) => ({
      ...pullOf([moved]),
      previousPaths: { [moved]: old },
    });
    expect(reviewerRoleFor(out("tooling/paperclip/src/reviewer-paths.ts"))).toBe("code-reviewer");
    expect(reviewerRoleFor(out(null))).toBe("code-reviewer");
    const fromCore = {
      ...pullOf(["apps/cli/src/a.ts"]),
      previousPaths: { "apps/cli/src/a.ts": "packages/core/app/src/a.ts" },
    };
    expect(routineRefusal(fromCore)).toBe("touches packages/core/app/src/a.ts");
    const inside = {
      ...pullOf(["apps/cli/src/b.ts"]),
      previousPaths: { "apps/cli/src/b.ts": "apps/cli/src/a.ts" },
    };
    expect(reviewerRoleFor(inside)).toBe("routine-reviewer");
  });

  test("every entry point a package exports is a public interface, excluded or the code reviewer's", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const manifests = globSync(["package.json", "{apps,packages,tooling}/**/package.json"], {
      cwd: root,
      exclude: (path) => path.includes("node_modules"),
    });
    const entries = manifests.flatMap((manifest) => {
      const exports: unknown = JSON.parse(readFileSync(join(root, manifest), "utf8")).exports;
      const targets: string[] = [];
      const walk = (value: unknown) => {
        if (typeof value === "string") {
          targets.push(posix.join(posix.dirname(manifest), value));
        } else if (typeof value === "object" && value !== null) {
          Object.values(value).forEach(walk);
        }
      };
      walk(exports);
      return targets;
    });
    expect(entries.length).toBeGreaterThan(100);
    const uncovered = entries.filter(
      (path) => !isPublicInterface(path) && !isRoutineExcluded(path) && !isLiamPath(path),
    );
    expect(uncovered, "add these to exportedEntryPoints in reviewer-paths-routine.ts").toEqual([]);
  });
});
