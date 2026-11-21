import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceWorkflows } from "./workspace-workflows.ts";
import type { WorkspaceWorkflowsParts } from "./workspace-workflows-parts.ts";

function parts(askTrust?: WorkspaceWorkflowsParts["askTrust"]): WorkspaceWorkflowsParts {
  return {
    files: {
      read: async () => null,
      list: async () => [],
      change: () => {},
      undo: () => false,
      step: 0,
    },
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
