import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { groupByPackage, inlineText, renderRequirementReport } from "./requirement-report.ts";
import type { Requirement } from "./requirements.ts";
import type { TestOutcome } from "./test-results.ts";
import type { TracedRequirement } from "./trace-model.ts";
import type { WorkspacePackage } from "./workspace.ts";

function workspacePackage(directory: string, name: string): WorkspacePackage {
  return { directory, manifestPath: `${directory}/package.json`, manifest: { name } };
}

const workflow = workspacePackage("packages/core/workflow", "@halonicjs/workflow");
const std = workspacePackage("packages/core/std", "@halonicjs/std");

function traced(
  pkg: WorkspacePackage,
  name: string,
  tests: TestOutcome[],
  status: Requirement["status"] = "active",
): TracedRequirement {
  const id = `${pkg.directory.split("/").at(-1)}.${name}`;
  return {
    pkg,
    tests,
    requirement: {
      id,
      file: `${pkg.directory}/requirements/${name}.md`,
      status,
      since: "0.1.0",
      source: "HAL-107",
      statement: `The engine shall ${name}.`,
      examples: [`Given a ${name}, then it works.`],
    },
  };
}

function ran(requirement: string, status: string): TestOutcome {
  return {
    file: "packages/core/workflow/src/timer.test.ts",
    name: `${requirement} works`,
    status,
    requirement,
    assertions: 1,
  };
}

verifies("check.requirement-report", () => {
  test("groups requirements by package and sorts them by ID", () => {
    const groups = groupByPackage([
      traced(workflow, "timer", []),
      traced(std, "ids", []),
      traced(workflow, "cron", []),
    ]);
    expect(
      groups.map((group) => [
        group.pkg.directory,
        group.requirements.map((one) => one.requirement.id),
      ]),
    ).toEqual([
      ["packages/core/std", ["std.ids"]],
      ["packages/core/workflow", ["workflow.cron", "workflow.timer"]],
    ]);
  });

  test("lists each requirement with its status, result, sentence, examples and tests", () => {
    const report = renderRequirementReport({
      pkg: workflow,
      requirements: [
        traced(workflow, "cron", [ran("workflow.cron", "passed"), ran("workflow.cron", "failed")]),
        traced(workflow, "draft-idea", [], "draft"),
        traced(workflow, "timer", [ran("workflow.timer", "passed")]),
      ],
    });
    expect(report.split("\n").slice(0, 9)).toEqual([
      "# Requirements: @halonicjs/workflow",
      "",
      "Made by `pnpm check trace --report` from the requirement files and the last test run. Don't edit it.",
      "",
      "| Requirement | Status | Since | Result |",
      "| --- | --- | --- | --- |",
      "| [`workflow.cron`](#workflowcron) | active | 0.1.0 | not passed (1 of 2) |",
      "| [`workflow.draft-idea`](#workflowdraft-idea) | draft | 0.1.0 | no tests ran |",
      "| [`workflow.timer`](#workflowtimer) | active | 0.1.0 | passed (1 of 1) |",
    ]);
    const timer = report.slice(report.indexOf("## workflow.timer"));
    expect(timer).toBe(
      [
        "## workflow.timer",
        "",
        "The engine shall timer.",
        "",
        "- Status: active, since 0.1.0",
        "- Source: HAL-107",
        "- File: `packages/core/workflow/requirements/timer.md`",
        "",
        "Examples:",
        "",
        "- Given a timer, then it works.",
        "",
        "Tests:",
        "",
        "- passed: `packages/core/workflow/src/timer.test.ts`: workflow.timer works",
        "",
      ].join("\n"),
    );
    expect(report).toContain("## workflow.draft-idea");
    expect(report).toContain("- none ran");
  });

  test("keeps a test name with | or a line break on one line, with | escaped", () => {
    expect(inlineText("a | b\nc\r\n  d")).toBe("a \\| b c d");
    const odd: TestOutcome = { ...ran("workflow.timer", "passed"), name: "x | y\nz" };
    const report = renderRequirementReport({
      pkg: workflow,
      requirements: [traced(workflow, "timer", [odd])],
    });
    expect(report).toContain("- passed: `packages/core/workflow/src/timer.test.ts`: x \\| y z\n");
  });
});
