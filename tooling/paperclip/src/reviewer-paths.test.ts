import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  isLiamPath,
  isSecurityPath,
  type ManifestChange,
  overLineLimit,
  reviewerFor,
  touchesPackageFields,
} from "./reviewer-paths.ts";

/** A package manifest before the change. */
const manifest = {
  name: "@halonicjs/acme",
  description: "Acme.",
  version: "0.1.0",
  bin: { halonic: "bin/halonic.js" },
  engines: { node: ">=26", npm: ">=10" },
  publishConfig: { access: "restricted" },
  pnpm: { onlyBuiltDependencies: ["esbuild"] },
  scripts: { test: "vitest", build: "tsc" },
};

/** The manifest before and after `edit` replaces some of its top-level fields. */
function change(edit: Record<string, unknown>): ManifestChange {
  return {
    before: JSON.stringify(manifest, null, 2),
    after: JSON.stringify({ ...manifest, ...edit }, null, 2),
  };
}

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
    "tooling/paperclip/src/reviewer-paths/routine.ts",
    "tooling/paperclip/src/merge-control/approval.ts",
    "tooling/paperclip/src/merge-control/signed.ts",
    "tooling/paperclip/src/pr-tools/approvals.ts",
    "packages/adapters/connector-stdio-sandbox/src/sandbox-connector.ts",
    "packages/studio/features/workspace/src/trust/trust-check-dialog.tsx",
    "docs/security/threat-model.md",
    "packages/host/router/providers.router.yaml",
    "tooling/paperclip/src/routing.ts",
    "packages/core/format/src/snapshot/routing.ts",
  ])("%s is on Liam's paths", (path) => {
    expect(isLiamPath(path)).toBe(true);
    expect(reviewerFor({ files: [path], changedLines: 10, sensitive: false })).toBe("liam");
  });

  test.each([
    "packages/adapters/paperclip-client/src/requests.ts",
    "packages/adapters/paperclip-client/src/sign-in-requests.ts",
  ])("a change to only the Paperclip provider's request list %s goes to Liam", (file) => {
    expect(reviewerFor({ files: [file], changedLines: 2, sensitive: false })).toBe("liam");
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

  test("more than 1500 lines of code, or a security or release change, goes to Liam", () => {
    const files = ["packages/core/app/src/a.ts"];
    expect(reviewerFor({ files, changedLines: 1400, sensitive: false })).toBe("julian");
    expect(reviewerFor({ files, changedLines: 1500, sensitive: false })).toBe("julian");
    expect(reviewerFor({ files, changedLines: 1501, sensitive: false })).toBe("liam");
    expect(reviewerFor({ files, changedLines: 1600, sensitive: false })).toBe("liam");
    expect(reviewerFor({ files, changedLines: 5, sensitive: true })).toBe("liam");
  });

  test("only tests and Markdown have no line limit", () => {
    const files = ["packages/core/app/src/a.test.ts", "docs/guides/a.md", "apps/cli/test/b.ts"];
    expect(reviewerFor({ files, changedLines: 2000, sensitive: false })).toBe("julian");
  });

  test("tests, Markdown and wording don't count toward the 1500 lines", () => {
    const files = ["packages/core/app/src/a.ts", "packages/core/app/src/a.test.ts", "docs/a.md"];
    const pull = { files, changedLines: 2400, sensitive: false };
    const fileLines = { [files[0] ?? ""]: 1400, [files[1] ?? ""]: 700, [files[2] ?? ""]: 300 };
    expect(reviewerFor({ ...pull, fileLines })).toBe("julian");
    expect(reviewerFor({ ...pull, fileLines: { ...fileLines, [files[0] ?? ""]: 1600 } })).toBe(
      "liam",
    );
    // Without each file's count, the whole pull request's lines count.
    expect(reviewerFor(pull)).toBe("liam");
  });

  test.each(["packages/core/events/src/run-events.ts", "packages/core/engine/src/kernel/step.ts"])(
    "more than 800 lines of code in %s goes to Liam",
    (path) => {
      const files = [path, "packages/core/app/src/a.ts"];
      const pull = { files, changedLines: 1000, sensitive: false };
      expect(reviewerFor({ ...pull, fileLines: { [path]: 900, [files[1] ?? ""]: 100 } })).toBe(
        "liam",
      );
      expect(reviewerFor({ ...pull, fileLines: { [path]: 800, [files[1] ?? ""]: 200 } })).toBe(
        "julian",
      );
      expect(reviewerFor({ files: [path], changedLines: 900, sensitive: false })).toBe("liam");
    },
  );

  test("tests in the kernel or the event types don't count toward its 800 lines", () => {
    const files = ["packages/core/events/src/run-events.test.ts", "packages/core/events/README.md"];
    expect(reviewerFor({ files, changedLines: 2000, sensitive: false })).toBe("julian");
  });

  test("the line limit says why a pull request is too big for Julian", () => {
    const files = ["packages/core/events/src/a.ts"];
    expect(overLineLimit({ files, changedLines: 1600, sensitive: false })).toBe(
      "1600 changed lines outside tests, Markdown and wording (limit 1500)",
    );
    expect(overLineLimit({ files, changedLines: 900, sensitive: false })).toBe(
      "900 changed lines in the kernel or the event types (limit 800)",
    );
    expect(overLineLimit({ files, changedLines: 800, sensitive: false })).toBeUndefined();
  });

  test("a word in a messages/ folder outside the CLI still counts", () => {
    expect(isLiamPath("packages/adapters/x/src/sandbox/messages/ipc.ts")).toBe(true);
  });

  test("security paths are the words on code, docs/security/ and SECURITY.md", () => {
    for (const path of ["packages/x/src/sandbox/fence.ts", "docs/security/a.md", "SECURITY.md"]) {
      expect(isSecurityPath(path)).toBe(true);
    }
    for (const path of ["packages/x/src/sandbox.test.ts", ".github/workflows/ci.yml", "a.ts"]) {
      expect(isSecurityPath(path)).toBe(false);
    }
  });

  test("a package.json goes to Julian only without lockfile or publish changes", () => {
    const files = ["apps/cli/package.json"];
    const manifests = { "apps/cli/package.json": change({ main: "b.js" }) };
    expect(reviewerFor({ files, changedLines: 2, sensitive: false, manifests })).toBe("julian");
    expect(reviewerFor({ files, changedLines: 2, sensitive: false })).toBe("liam");
    expect(
      reviewerFor({
        files: [...files, "pnpm-lock.yaml"],
        changedLines: 9,
        sensitive: false,
        manifests,
      }),
    ).toBe("liam");
    expect(touchesPackageFields(change({ version: "0.1.1" }))).toBe(true);
    expect(touchesPackageFields(change({ scripts: { postinstall: "node x.js" } }))).toBe(true);
    expect(touchesPackageFields(change({ scripts: { test: "vitest run" } }))).toBe(false);
  });

  // Julian's finding on #5059: a diff shows only the inner key of these.
  test.each([
    ["publishConfig", { publishConfig: { access: "public" } }],
    ["engines", { engines: { node: ">=18" } }],
    ["bin", { bin: { halonic: "bin/evil.js" } }],
    ["pnpm", { pnpm: { onlyBuiltDependencies: ["esbuild", "evil"] } }],
  ])("a change inside %s is Liam's", (_field, edit) => {
    expect(touchesPackageFields(change(edit))).toBe(true);
    expect(touchesPackageFields(change({ description: "The CLI.", ...edit }))).toBe(true);
  });

  test("a harmless field or a key order change is Julian's", () => {
    expect(touchesPackageFields(change({ description: "The CLI." }))).toBe(false);
    const reordered = JSON.stringify({ ...manifest, engines: { npm: ">=10", node: ">=26" } });
    expect(touchesPackageFields({ before: JSON.stringify(manifest), after: reordered })).toBe(
      false,
    );
  });

  test("a new, unparseable or one-line manifest that sets a version is Liam's", () => {
    expect(touchesPackageFields({ before: null, after: '{"name":"x","version":"1.0.0"}' })).toBe(
      true,
    );
    expect(touchesPackageFields({ before: JSON.stringify(manifest), after: "{" })).toBe(true);
    expect(touchesPackageFields({ before: "[]", after: "[]" })).toBe(true);
  });
});
