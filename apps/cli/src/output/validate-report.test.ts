import { join } from "node:path";
import type { LoadedWorkspace, WorkspaceIssue } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { validateFails, validateLines, validateReport } from "./validate-report.ts";

/** A problem as `loadWorkspace` reports it. */
function problem(
  file: string,
  line: number,
  col: number,
  severity: "error" | "warning",
  code: string,
  message: string,
): WorkspaceIssue {
  return { file, line, col, severity, code, message, source: "check", path: [] };
}

/** A loaded workspace with `checked` files, the problems' files among them. */
function loaded(issues: readonly WorkspaceIssue[], checked: number): LoadedWorkspace {
  const files = Array.from({ length: checked }, (_, index) => ({ path: `file-${index}.yaml` }));
  return {
    location: "memory:acme",
    version: "1",
    files: files as unknown as LoadedWorkspace["files"],
    issues,
    ignored: [],
  };
}

const sorter = "hubs/support/agents/sorter.agent.yaml";
const supportReply = "hubs/support/workflows/support-reply.workflow.yaml";

/** The three problems of the cli-output 3.2 example, out of order. */
const designProblems = [
  problem(
    supportReply,
    8,
    3,
    "warning",
    "unreachable-step",
    "The step Archive has no arrow into it, so it never runs.",
  ),
  problem(
    supportReply,
    40,
    13,
    "error",
    "unknown-step",
    'The arrow from Classify goes to "Drat reply", which isn\'t a step in this workflow. Did you mean Draft reply?',
  ),
  problem(
    sorter,
    12,
    10,
    "error",
    "unknown-alias",
    'The model alias "smrt" isn\'t in models.yaml. Use one of: fast, smart.',
  ),
];

const view = { workspace: "acme", all: false, strict: false };

describe("validateLines", () => {
  it("prints the design's example: files in path order, errors first, the colons lined up", () => {
    // 12 files checked, two of them the problems' own, gives the design's 14.
    const report = validateReport(loaded(designProblems, 12));

    expect(validateLines(report, view).map(plainText)).toEqual([
      join("hubs", "support", "agents", "sorter.agent.yaml"),
      '  12:10  ✕ The model alias "smrt" isn\'t in models.yaml. Use one of: fast, smart.  (unknown-alias)',
      "",
      join("hubs", "support", "workflows", "support-reply.workflow.yaml"),
      '  40:13  ✕ The arrow from Classify goes to "Drat reply", which isn\'t a step in this workflow. Did you mean Draft reply?  (unknown-step)',
      "   8:3   ! The step Archive has no arrow into it, so it never runs.  (unreachable-step)",
      "",
      "✕ 2 errors and 1 warning in 2 files. Checked 14 files.",
    ]);
  });

  it("lets errors fill the 20 before warnings, and says how many it left out", () => {
    const warnings = Array.from({ length: 5 }, (_, index) =>
      problem("a.yaml", index + 1, 1, "warning", "w", "A warning."),
    );
    const errors = Array.from({ length: 18 }, (_, index) =>
      problem("b.yaml", index + 1, 1, "error", "e", "An error."),
    );
    const report = validateReport(loaded([...warnings, ...errors], 0));

    const lines = validateLines(report, { ...view, dir: "./acme" }).map(plainText);

    expect(lines.filter((line) => line.includes("✕ An error."))).toHaveLength(18);
    expect(lines.filter((line) => line.includes("! A warning."))).toHaveLength(2);
    expect(lines.slice(-2)).toEqual([
      "Showing the first 20 of 23 problems. Run halonic validate --dir ./acme --all to see them all.",
      "✕ 18 errors and 5 warnings in 2 files. Checked 2 files.",
    ]);
  });

  it("passes with only warnings, and fails on them with --strict", () => {
    const report = validateReport(loaded([designProblems[0] as WorkspaceIssue], 3));

    expect(validateFails(report, false)).toBe(false);
    expect(plainText(validateLines(report, view).at(-1) ?? [])).toBe(
      "✓ Checked 4 files in acme. 1 warning.",
    );
    expect(validateFails(report, true)).toBe(true);
    expect(plainText(validateLines(report, { ...view, strict: true }).at(-1) ?? [])).toBe(
      "✕ 1 warning in 1 file. Checked 4 files.",
    );
  });

  it("says there are no problems in one ✓ line", () => {
    const report = validateReport(loaded([], 3));

    expect(validateFails(report, true)).toBe(false);
    expect(validateLines(report, view).map(plainText)).toEqual([
      "✓ Checked 3 files in acme. No problems.",
    ]);
  });
});

describe("validateReport", () => {
  it("orders every problem errors first, then by file, line and column, for --json", () => {
    const report = validateReport(loaded(designProblems, 12));

    expect(report.problems.map(({ file, line }) => `${file}:${line}`)).toEqual([
      `${sorter}:12`,
      `${supportReply}:40`,
      `${supportReply}:8`,
    ]);
    expect(report.counts).toEqual({ errors: 2, warnings: 1, filesWithProblems: 2, checked: 14 });
  });
});
