import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inboxItems } from "./inbox-items.ts";
import { approvalTitle } from "./plain/approval-text.ts";
import { pendingApproval, waitingRun } from "./test-runs.test-helper.ts";

/** The tool step `merge` waits for an OK on `merge_pull_request` of `github`. */
const toolStepAsks = {
  ...pendingApproval("call-1", "github__merge_pull_request", "T1"),
  agent: "merge",
  step: "tool" as const,
};

/** An agent that happens to be called `merge` would be named by its file. */
const nameOfAgent = (id: string) => (id === "merge" ? "Merger" : id);

verifies("inbox.tool-step-asker", () => {
  it("names the tool step where an agent's name would be", () => {
    const [item] = inboxItems([waitingRun("r1", { approvals: [toolStepAsks] })], nameOfAgent);

    expect(item).toMatchObject({ kind: "approval", agentName: 'Tool step "merge"' });
    expect(item?.kind === "approval" && approvalTitle(item)).toBe(
      'Tool step "merge" wants to use merge_pull_request (github)',
    );
  });

  it("still names an agent's call by the agent", () => {
    const { step: _, ...agentAsks } = toolStepAsks;
    const [item] = inboxItems([waitingRun("r1", { approvals: [agentAsks] })], nameOfAgent);

    expect(item).toMatchObject({ agentName: "Merger" });
  });
});
