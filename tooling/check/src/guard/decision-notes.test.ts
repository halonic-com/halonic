import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";

const file = "decisions/julian/HAL-118-example.md";

const wellFormed = `# Decision: retire the old timer rule

- Approval: https://paperclip.example/HAL/approvals/1234
- Kind: internal

The timer moved to the routines package.

## Covers

- \`workflow.timer-fires\`
- packages/core/workflow/src/timer.test.ts
`;

function problemsOf(text: string): string[] {
  const parsed = parseDecisionNote(file, text);
  return parsed.ok ? [] : parsed.problems.map((problem) => `${problem.line}: ${problem.message}`);
}

verifies("check.decision-note-format", () => {
  test("reads the approval, the kind and exactly the Covers entries", () => {
    expect(parseDecisionNote(file, wellFormed)).toEqual({
      ok: true,
      note: {
        file,
        approval: "https://paperclip.example/HAL/approvals/1234",
        kind: "internal",
        covers: ["workflow.timer-fires", "packages/core/workflow/src/timer.test.ts"],
      },
    });
  });

  test("names the note after the branch, slashes included", () => {
    expect(decisionNoteFile("julian/HAL-118-example")).toBe(file);
  });

  test.each([
    ["no heading", wellFormed.replace("# Decision", "Decision"), /"# " heading/],
    ["no approval", wellFormed.replace(/- Approval:.*\n/, ""), /Approval: <link>/],
    ["an empty approval", wellFormed.replace(/(- Approval:).*/, "$1"), /Approval: <link>/],
    ["no kind", wellFormed.replace("- Kind: internal\n", ""), /Kind: user-visible/],
    ["an unknown kind", wellFormed.replace("internal", "minor"), /^4: .*Kind: user-visible/],
    ["no reason", wellFormed.replace("The timer moved to the routines package.\n", ""), /why/],
    ["no Covers list", wellFormed.slice(0, wellFormed.indexOf("## Covers")), /## Covers/],
    ["an empty Covers list", wellFormed.replace(/## Covers[\s\S]*/, "## Covers\n"), /## Covers/],
    ["a Covers entry with prose", `${wellFormed}- the timer test\n`, /^12: .*one requirement ID/],
  ])("reports a note with %s", (_case, text, problem) => {
    const problems = problemsOf(text);
    expect(problems.some((line) => problem.test(line))).toBe(true);
  });
});
