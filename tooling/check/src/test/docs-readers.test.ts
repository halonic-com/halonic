import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { findRepoRoot, type WorkspacePackage } from "../lib/workspace.ts";
import { checkDocsReaders } from "../rules/docs-readers.ts";

const packages: WorkspacePackage[] = [
  { directory: ".", manifestPath: "package.json", manifest: { name: "@acme/root" } },
  { directory: "apps/cli", manifestPath: "apps/cli/package.json", manifest: { name: "acme" } },
];

// Built from parts, so this file doesn't read as a test reading the doc
// when the rule checks the real repo.
const up = "../".repeat(3);

const files: Readonly<Record<string, string>> = {
  "docs/guides/runbook.md": "# Runbook\n",
  "apps/cli/src/runbook.test.ts": [
    'import { readFileSync } from "node:fs";',
    "",
    `const runbook = new URL("${up}docs/guides/runbook.md", import.meta.url);`,
    'readFileSync(runbook, "utf8");',
    "",
  ].join("\n"),
};

const context = {
  files: Object.keys(files),
  packages,
  read: (file: string) => files[file] ?? "",
};

/** The `file:line message` of each finding for this map. */
function findings(listed: Readonly<Record<string, readonly string[]>>): string[] {
  return checkDocsReaders(context, listed).problems.map(
    ({ file, line, message }) => `${file}:${line ?? ""} ${message}`,
  );
}

verifies("check.docs-readers", () => {
  describe("tooling/check: docs-readers", () => {
    it("fails on a test reading a doc docsReaders doesn't list, and passes with the entry", () => {
      expect(findings({})).toEqual([
        `apps/cli/src/runbook.test.ts:3 This test reads docs/guides/runbook.md, but docsReaders in tooling/check/src/lib/affected-tests.ts doesn't list acme for it, so a change to that doc wouldn't run this test. Add "acme" to its entry.`,
      ]);
      expect(findings({ "docs/guides/runbook.md": ["acme"] })).toEqual([]);
    });

    it("fails on an entry for another package, or for a doc that doesn't exist", () => {
      expect(findings({ "docs/guides/runbook.md": ["acme", "@acme/format"] })).toEqual([
        "tooling/check/src/lib/affected-tests.ts: docsReaders lists @acme/format for docs/guides/runbook.md, but none of that package's tests read it. Remove @acme/format from its entry.",
      ]);
      expect(
        findings({ "docs/guides/runbook.md": ["acme"], "docs/guides/gone.md": ["acme"] }),
      ).toEqual([
        "tooling/check/src/lib/affected-tests.ts: docsReaders lists docs/guides/gone.md, which doesn't exist. Remove its entry.",
      ]);
    });

    it("finds a path the formatter put on the line after findRepoRoot()", () => {
      const read = () =>
        'readFileSync(\n  join(findRepoRoot(),\n    "docs/guides/runbook.md"),\n  "utf8",\n);\n';
      const problems = checkDocsReaders({ ...context, read }, {}).problems;
      expect(problems.map(({ line }) => line)).toEqual([3]);
    });

    it("passes on the real repo", () => {
      expect(checkDocsReaders(loadContext(findRepoRoot())).problems).toEqual([]);
    });
  });
});
