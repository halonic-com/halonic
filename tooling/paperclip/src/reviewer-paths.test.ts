import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { isLiamPath, reviewerFor, touchesPackageFields } from "./reviewer-paths.ts";

verifies("paperclip.reviewer-paths", () => {
  test("a change outside Liam's paths goes to Julian", () => {
    const files = ["packages/studio/features/inbox/src/view.tsx"];
    expect(reviewerFor({ files, changedLines: 120, sensitive: false })).toBe("julian");
  });

  test.each([
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    "tooling/check/src/guard/note-check.ts",
    "tooling/paperclip/src/reviewer-paths.ts",
    "packages/adapters/connector-stdio-sandbox/src/sandbox-connector.ts",
    "packages/studio/features/workspace/src/trust/trust-check-dialog.tsx",
    "docs/security/threat-model.md",
  ])("%s is on Liam's paths", (path) => {
    expect(isLiamPath(path)).toBe(true);
    expect(reviewerFor({ files: [path], changedLines: 10, sensitive: false })).toBe("liam");
  });

  test.each([
    ".changeset/trust-words.md",
    "docs/guides/Sign-In.md",
    "packages/core/format/src/kinds/integration/secret-words.ts",
    "apps/cli/src/messages/sandbox.ts",
    "packages/core/app/src/sandbox-start-words.test.ts",
    "packages/adapters/connector-stdio-sandbox/requirements/call-timeout-cause.md",
  ])("a word in %s doesn't count: it's a test, Markdown or wording", (path) => {
    expect(isLiamPath(path)).toBe(false);
  });

  test("more than 800 lines, or a security or release change, goes to Liam", () => {
    const files = ["packages/core/app/src/a.ts"];
    expect(reviewerFor({ files, changedLines: 801, sensitive: false })).toBe("liam");
    expect(reviewerFor({ files, changedLines: 800, sensitive: false })).toBe("julian");
    expect(reviewerFor({ files, changedLines: 5, sensitive: true })).toBe("liam");
  });

  test("only tests and Markdown have no line limit", () => {
    const files = ["packages/core/app/src/a.test.ts", "docs/guides/a.md", "apps/cli/test/b.ts"];
    expect(reviewerFor({ files, changedLines: 2000, sensitive: false })).toBe("julian");
  });

  test("a package.json goes to Julian only without lockfile or publish changes", () => {
    const files = ["apps/cli/package.json"];
    const exports = '@@ -3 +3 @@\n-  "main": "a.js",\n+  "main": "b.js",';
    const version = '@@ -2 +2 @@\n-  "version": "0.1.0",\n+  "version": "0.1.1",';
    const patches = { "apps/cli/package.json": exports };
    expect(reviewerFor({ files, changedLines: 2, sensitive: false, patches })).toBe("julian");
    expect(reviewerFor({ files, changedLines: 2, sensitive: false })).toBe("liam");
    expect(
      reviewerFor({
        files: [...files, "pnpm-lock.yaml"],
        changedLines: 9,
        sensitive: false,
        patches,
      }),
    ).toBe("liam");
    expect(touchesPackageFields(version)).toBe(true);
    expect(touchesPackageFields('+    "postinstall": "node x.js",')).toBe(true);
  });
});
