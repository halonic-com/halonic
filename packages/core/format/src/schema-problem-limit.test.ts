import type { Issue } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { wordIssues } from "./shared/missing-keys.ts";
import { problemsOf, yaml } from "./test/parse.spec.ts";

/** An agent file with `count` fields an agent doesn't allow. */
function agentWithExtraFields(count: number): string {
  const extra = Array.from({ length: count }, (_, index) => `extra${index}: x`);
  return yaml("id: clerk", "name: Clerk", ...extra);
}

verifies("format.schema-problem-limit", () => {
  it("reports the first 100 schema problems and counts the rest", () => {
    const problems = problemsOf("agent", agentWithExtraFields(150));
    expect(problems).toHaveLength(101);
    expect(problems.slice(0, 100).every((problem) => problem.code === "unrecognized_keys")).toBe(
      true,
    );
    expect(problems.at(-1)).toMatchObject({
      severity: "error",
      code: "too-many-problems",
      path: [],
      message: "This file has 50 more problems. Fix the ones above, then check it again.",
      line: 1,
      col: 1,
    });
  });

  it("reports 100 schema problems without a count", () => {
    const problems = problemsOf("agent", agentWithExtraFields(100));
    expect(problems).toHaveLength(100);
    expect(problems.some((problem) => problem.code === "too-many-problems")).toBe(false);
  });

  it("words many missing keys and unknown fields in linear time", () => {
    // 100,000 list entries, each missing `name` and with one unknown field.
    const count = 100_000;
    const data = {
      items: Array.from({ length: count }, (_, index) => ({ [`nmae${index}`]: "x" })),
    };
    const issues: Issue[] = data.items.flatMap((_, index): Issue[] => [
      { code: "invalid_type", path: ["items", index, "name"], message: "Invalid input" },
      {
        code: "unrecognized_keys",
        path: ["items", index],
        message: "Unrecognized key",
        keys: [`nmae${index}`],
      },
    ]);
    const worded = wordIssues(issues, data);
    expect(worded).toHaveLength(2 * count);
    expect(worded[0]?.message).toBe('Missing required key "name"');
    expect(worded.at(-1)?.message).toBe(
      `There's no field "nmae${count - 1}" in "items[${count - 1}]".`,
    );
  });
});
