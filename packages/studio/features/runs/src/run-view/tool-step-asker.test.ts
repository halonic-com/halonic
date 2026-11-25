import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { runChangeText } from "./run-change.ts";

const context = {
  workflow: { name: "Watch", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: () => undefined,
  // An agent that happens to be called `merge` would be named by its file.
  agentName: (id: string) => (id === "merge" ? "Merger" : undefined),
  currency: "EUR",
  now: mondayMorning,
};

const toolStepAsks = {
  ...approvalAt(1),
  agent: "merge",
  tool: "merge_pull_request",
  connector: "github",
  step: "tool" as const,
};

verifies("runs.run-view.tool-step-asker", () => {
  it("names the tool step that asks where an agent's name would be", () => {
    const summary = summaryWith({ id: "run_mfx3k2a1_650704", approvals: [toolStepAsks] });

    expect(runChangeText({ summary }, [], context)).toBe(
      'Run 650704 needs you. Waiting for your approval: Tool step "merge" wants to use merge_pull_request (github).',
    );
  });
});
