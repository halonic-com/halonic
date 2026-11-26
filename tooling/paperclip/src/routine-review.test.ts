import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type RoutedPull, reviewerFor, reviewerRoleFor, routineRefusal } from "./reviewer-paths.ts";

/** A pull request with these files and this many changed lines, none of them sensitive. */
function pullOf(files: readonly string[], changedLines = 40): RoutedPull {
  return { files, changedLines, sensitive: false };
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
    const after = manifest.replace("}", ',"main":"b.js"}');
    const changed = { ...pullOf([path]), manifests: { [path]: { before: manifest, after } } };
    expect(routineRefusal(changed)).toBeNull();
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

  test("until Nora runs, Julian covers routine reviews", () => {
    expect(reviewerFor(pullOf(["apps/cli/src/commands/run.ts"]))).toBe("julian");
  });
});
