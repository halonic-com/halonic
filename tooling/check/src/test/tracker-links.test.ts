import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { findTrackerLinks } from "../rules/tracker-links.ts";
import { runChecks } from "./fixture-repo.ts";

/** The tracker-links errors for these files, as "file:line". */
function problems(files: Record<string, string>): string[] {
  return runChecks([], { rules: ["tracker-links"], extraFiles: files }).map(
    (problem) => `${problem.file}:${problem.line}`,
  );
}

verifies("check.tracker-links", () => {
  test("fails on an inline tracker link in a README, with its line", () => {
    const file = "packages/core/std/README.md";
    expect(problems({ [file]: "# std\n\nSee [HAL-136](/HAL/issues/HAL-136).\n" })).toEqual([
      `${file}:3`,
    ]);
  });

  test("fails on a link to a task document in a Source: line", () => {
    const file = "packages/core/std/requirements/parse.md";
    const text = "# std.parse\n\n- Source: [plan](/HAL/issues/HAL-1#document-plan); task HAL-2\n";
    expect(problems({ [file]: text })).toEqual([`${file}:3`]);
  });

  test("fails on a reference definition", () => {
    const file = "docs/adr/2026-11-12-example.md";
    expect(problems({ [file]: "See the [plan].\n\n[plan]: /HAL/issues/HAL-1\n" })).toEqual([
      `${file}:3`,
    ]);
  });

  test("tells the author to write the task id as plain text", () => {
    const [problem] = runChecks([], {
      rules: ["tracker-links"],
      extraFiles: { "README.md": "[HAL-1](/HAL/issues/HAL-1)\n" },
    });
    expect(problem?.message).toContain("plain text (HAL-136)");
  });

  test("allows plain task ids, other links and files that aren't Markdown", () => {
    expect(
      problems({
        "docs/guides/example.md": "Decided on HAL-136; see [the ADR](../adr/x.md).\n",
        "tooling/check/src/example.ts": 'const target = "](/HAL/issues/HAL-1)";\n',
      }),
    ).toEqual([]);
  });

  test("ignores code blocks and code spans", () => {
    const text = [
      "Don't write `[HAL-1](/HAL/issues/HAL-1)`.",
      "",
      "```md",
      "[HAL-1](/HAL/issues/HAL-1)",
      "```",
      "",
      "But [this](/HAL/issues/HAL-2) counts.",
    ].join("\r\n");
    expect(findTrackerLinks(text)).toEqual([7]);
  });
});
