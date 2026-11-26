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
      "tooling/paperclip/src/pr-watcher/watch.ts",
      "touches tooling/paperclip/src/pr-watcher/watch.ts",
    ],
    [
      "packages/studio/features/inbox/src/index.ts",
      "changes a public interface (packages/studio/features/inbox/src/index.ts)",
    ],
  ])("%s stays with the second reviewer: %s", (file, reason) => {
    expect(routineRefusal(pullOf([file]))).toBe(reason);
    expect(reviewerRoleFor(pullOf([file]))).toBe("second-reviewer");
  });

  test("a package.json Julian may approve still isn't routine: it can add a package or a dependency", () => {
    const path = "packages/studio/features/inbox/package.json";
    const manifest = JSON.stringify({ name: "@halonicjs/acme", version: "0.1.0" });
    const after = manifest.replace("}", ',"main":"b.js"}');
    const pull = { ...pullOf([path]), manifests: { [path]: { before: manifest, after } } };
    expect(routineRefusal(pull)).toBe(`changes a package manifest (${path})`);
    expect(reviewerRoleFor(pull)).toBe("second-reviewer");
  });

  test("a pull request outside Julian's limits is never routine", () => {
    for (const pull of [
      pullOf([".github/workflows/ci.yml"]),
      pullOf(["packages/x/src/sandbox/fence.ts"]),
      { ...pullOf(["apps/cli/src/a.ts"]), sensitive: true },
    ]) {
      expect(routineRefusal(pull)).toBe("outside the second reviewer's limits");
      expect(reviewerRoleFor(pull)).toBe("code-reviewer");
    }
  });

  test("more than 800 lines of code isn't routine; tests, Markdown and wording don't count", () => {
    const files = ["apps/cli/src/a.ts", "apps/cli/src/a.test.ts", "docs/a.md"];
    const fileLines = { "apps/cli/src/a.ts": 800, "apps/cli/src/a.test.ts": 900, "docs/a.md": 300 };
    expect(routineRefusal({ ...pullOf(files, 2000), fileLines })).toBeNull();
    expect(
      routineRefusal({
        ...pullOf(files, 2000),
        fileLines: { ...fileLines, "apps/cli/src/a.ts": 801 },
      }),
    ).toBe("801 changed lines outside tests, Markdown and wording (limit 800)");
    expect(routineRefusal(pullOf(["apps/cli/src/a.ts"], 801))).toBe(
      "801 changed lines outside tests, Markdown and wording (limit 800)",
    );
  });

  test("until Nora's calibration ends, Julian covers routine reviews", () => {
    expect(reviewerFor(pullOf(["apps/cli/src/commands/run.ts"]))).toBe("julian");
  });
});
