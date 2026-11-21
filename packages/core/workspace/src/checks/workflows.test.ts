import type { ParityCase } from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";
import { parityLoadLimitMs, readParityCase } from "../test/parity-cases.spec.ts";

// Each case breaks one rule of a workflow or one name it gives another file.
const workflowCases = [
  "workflow/missing-initial",
  "workflow/dead-end",
  "workflow/unreachable",
  "workflow/no-final",
  "workflow/final-has-transitions",
  "workflow/unknown-gets",
  "workflow/timer-outside-wait",
  "workflow/wait-without-events",
  "workflow/unguarded-shadow",
  "workflow/foreach-without-items",
  "workflow/foreach-agent-and-workflow",
  "workflow/parallel-without-branches",
  "workflow/subflow-without-target",
  "workflow/self-subflow",
  "workflow/unknown-subflow",
  "workflow/unknown-method",
  "workflow/branch-unknown-method",
  "workflow/method-missing-argument",
  "workflow/method-extra-argument",
  "workflow/subflow-loop",
];

// The old loader's words for a missing agent or step, in the words Studio's step card uses
// (HAL-15431, allowed difference missing-agent-and-step-words).
const missingNameCases: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  [
    "workflow/unknown-target",
    [
      ["error", '"start" goes to the step "finish", which this workflow doesn\'t have'],
      ["warning", '"done" can never be reached'],
    ],
  ],
  [
    "workflow/unknown-agent",
    [["error", '"start" uses the agent "auditor", which its hub doesn\'t have']],
  ],
  [
    "workflow/unknown-branch-agent",
    [["error", 'Branch "audit" of "start" uses the agent "auditor", which its hub doesn\'t have']],
  ],
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

  it.each(missingNameCases)(
    "gives %s the old loader's issues in the step card's words, the first where its case file says",
    async (caseId, issues) => {
      const { parityCase, source } = readParityCase(caseId);
      const workspace = await loadWorkspace(source);
      const found = workspace.issues.filter((issue) => issue.source === "check");
      expect(found.map((issue) => [issue.severity, issue.message])).toEqual(issues);
      const first = found[0];
      expect(first && { file: first.file, path: first.path.join("."), line: first.line }).toEqual(
        expectedPlace(caseId, parityCase.expect),
      );
    },
    parityLoadLimitMs,
  );

  // The old loader warned; the engine fails the step, so it is an error now (HAL-14303, allowed
  // difference task-without-agent-is-an-error).
  it(
    "gives workflow/task-without-agent an error, at the place its case file says",
    async () => {
      const caseId = "workflow/task-without-agent";
      const { parityCase, source } = readParityCase(caseId);
      const workspace = await loadWorkspace(source);
      const found = workspace.issues.filter((issue) => issue.source === "check");
      expect(found.map((issue) => [issue.severity, issue.code])).toEqual([
        ["error", "task-without-agent"],
      ]);
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
      [
        "states.check.agent",
        `"check" uses the agent "clerk", which its hub doesn't have. clerk is in the hub billing; a workflow can only use its own hub's agents.`,
      ],
    ]);
  });

  it("counts the keys of the workflow's tests' inputs as its input fields", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "agents/writer.agent.yaml": "name: Writer\n",
        "workflows/reply.workflow.yaml": [
          "name: Reply",
          "initial: read",
          "states:",
          "  read:",
          "    agent: writer",
          "    gets: [input.from, input.order]",
          "    on: [{ to: done }]",
          "  done: { type: final }",
          "",
        ].join("\n"),
        "workflows/reply.test.yaml": [
          "workflow: reply",
          "cases:",
          "  - name: A question",
          "    input: { mail: Hi, from: sam@example.com }",
          "",
        ].join("\n"),
      }),
    );
    expect(workspace.issues.map((issue) => [issue.code, issue.path.join("."), issue.line])).toEqual(
      [["unknown-gets", "states.read.gets.1", 6]],
    );
    expect(workspace.issues[0]?.message).toBe(
      "\"read\" gets input.order, but the workflow's input has no field order. It has only mail and from: read one of those, or add order to a test case's input in reply.test.yaml.",
    );
  });
});
