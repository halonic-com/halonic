import { describe, expect, it } from "vitest";
import { fileAsItem } from "./file-as-item.ts";

describe("fileAsItem", () => {
  it("gives the agent an agent's file defines, in its hub", () => {
    expect(fileAsItem("hubs/billing/agents/clerk.agent.yaml")).toEqual({
      kind: "agent",
      item: { kind: "agent", hub: "billing", id: "clerk" },
    });
  });

  it("gives a workflow and a routine at the workspace's top the empty hub", () => {
    expect(fileAsItem("workflows/invoice.workflow.yaml")?.item).toEqual({
      kind: "workflow",
      hub: "",
      id: "invoice",
    });
    expect(fileAsItem("workflows/routines/hourly.routine.yaml")?.kind).toBe("routine");
  });

  it("gives nothing for a file of a kind with no page, or of no kind", () => {
    expect(fileAsItem("workflows/invoice.test.yaml")).toBeUndefined();
    expect(fileAsItem("hubs/billing/hub.yaml")).toBeUndefined();
    expect(fileAsItem("models.yaml")).toBeUndefined();
    expect(fileAsItem("README.md")).toBeUndefined();
  });
});
