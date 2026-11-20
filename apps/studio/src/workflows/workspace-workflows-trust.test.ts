import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceWorkflows, type WorkspaceWorkflowsParts } from "./workspace-workflows.ts";

function parts(askTrust?: WorkspaceWorkflowsParts["askTrust"]): WorkspaceWorkflowsParts {
  return {
    files: { read: async () => null, list: async () => [], change: () => {} },
    onChange: () => () => {},
    runs: { list: async () => [], subscribe: () => () => {}, log: async () => [] },
    ...(askTrust ? { askTrust } : {}),
  };
}

verifies("studio.start-asks-trust", () => {
  it("passes the window's trust check on to the Run panel", async () => {
    expect(new WorkspaceWorkflows(parts()).askTrust).toBeUndefined();
    const asked = new WorkspaceWorkflows(parts(async () => "declined"));
    expect(await asked.askTrust?.()).toBe("declined");
  });
});
