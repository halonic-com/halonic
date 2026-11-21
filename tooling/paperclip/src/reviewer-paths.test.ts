import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { isLiamPath, reviewerFor } from "./reviewer-paths.ts";

verifies("paperclip.reviewer-paths", () => {
  test("a small change outside Liam's paths goes to Julian", () => {
    const files = ["packages/studio/features/inbox/src/view.tsx"];
    expect(reviewerFor({ files, changedLines: 120, sensitive: false })).toBe("julian");
  });

  test.each([
    "apps/cli/package.json",
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    "tooling/check/src/guard/note-check.ts",
    "packages/adapters/sandbox-srt/src/run.ts",
    "docs/guides/Sign-In.md",
  ])("%s is on Liam's paths", (path) => {
    expect(isLiamPath(path)).toBe(true);
    expect(reviewerFor({ files: [path], changedLines: 10, sensitive: false })).toBe("liam");
  });

  test("a changeset's file name doesn't count", () => {
    expect(isLiamPath(".changeset/trust-words.md")).toBe(false);
    expect(isLiamPath(".changeset/config.json")).toBe(true);
  });

  test("more than 400 lines, or a security or release change, goes to Liam", () => {
    expect(reviewerFor({ files: ["docs/guides/a.md"], changedLines: 401, sensitive: false })).toBe(
      "liam",
    );
    expect(reviewerFor({ files: ["docs/guides/a.md"], changedLines: 400, sensitive: false })).toBe(
      "julian",
    );
    expect(reviewerFor({ files: ["docs/guides/a.md"], changedLines: 5, sensitive: true })).toBe(
      "liam",
    );
  });
});
