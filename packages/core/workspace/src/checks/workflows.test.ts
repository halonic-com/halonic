import type { ParityCase } from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";
import { parityLoadLimitMs, readParityCase } from "../test/parity-cases.spec.ts";

// Each case breaks one rule of a workflow or one name it gives another file.
const workflowCases = [
  "workflow/missing-initial",
  "workflow/unknown-target",
  "workflow/dead-end",
  "workflow/unreachable",
  "workflow/no-final",
  "workflow/final-has-transitions",
  "workflow/unknown-gets",
  "workflow/task-without-agent",
  "workflow/timer-outside-wait",
  "workflow/wait-without-events",
  "workflow/unguarded-shadow",
  "workflow/foreach-without-items",
  "workflow/foreach-agent-and-workflow",
  "workflow/parallel-without-branches",
  "workflow/subflow-without-target",
  "workflow/self-subflow",
  "workflow/unknown-agent",
  "workflow/unknown-branch-agent",
  "workflow/unknown-subflow",
  "workflow/unknown-method",
  "workflow/branch-unknown-method",
  "workflow/method-missing-argument",
  "workflow/method-extra-argument",
  "workflow/subflow-loop",
];

// An issue about a map, such as a whole state, sits where the map's value
// starts: one line below the key the case file names. HAL-2045 asks the yaml
// package to point at the key instead.
const valueLineCases = new Set([
  "workflow/dead-end",
  "workflow/unreachable",
  "workflow/final-has-transitions",
  "workflow/task-without-agent",
  "workflow/wait-without-events",
  "workflow/foreach-without-items",
  "workflow/foreach-agent-and-workflow",
  "workflow/parallel-without-branches",
  "workflow/subflow-without-target",
]);

/** Where the first issue of a case sits: its case file's place, a line lower for an issue about a map. */
function expectedPlace(caseId: string, expected: ParityCase["expect"]): ParityCase["expect"] {
  if (expected === null || expected.line === null || !valueLineCases.has(caseId)) {
    return expected;
  }
  return { ...expected, line: expected.line + 1 };
}

verifies("workspace.workflows", () => {
  it.each(workflowCases)(
    "gives %s the old loader's errors and warnings, the first where its case file says",
    async (caseId) => {
      const { parityCase, recording, source } = readParityCase(caseId);
      const workspace = await loadWorkspace(source);
      const found = workspace.issues.filter((issue) => issue.source === "check");
      expect(found.map((issue) => [issue.severity, issue.message])).toEqual(
        recording.diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.message]),
      );
      const first = found[0];
      expect(first && { file: first.file, path: first.path.join("."), line: first.line }).toEqual(
        expectedPlace(caseId, parityCase.expect),
      );
    },
    parityLoadLimitMs,
  );

  it("looks up a root workflow's agents and workflows at the root", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "agents/helper.agent.yaml": "name: Helper\n",
        "hubs/billing/hub.yaml": "name: Billing\n",
        "hubs/billing/agents/clerk.agent.yaml": "name: Clerk\n",
        "workflows/daily.workflow.yaml": [
          "name: Daily",
          "initial: ask",
          "states:",
          "  ask: { agent: helper, on: [{ to: check }] }",
          "  check: { agent: clerk, on: [{ to: done }] }",
          "  done: { type: final }",
          "",
        ].join("\n"),
      }),
    );
    expect(workspace.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["states.check.agent", '"check" uses unknown agent "clerk"'],
    ]);
  });
});
