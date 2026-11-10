import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { hubWorkflows, lookUpWorkflow, workflowIn } from "./hub-workflows.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** A workflow file with one final step, enough to be looked up. */
function workflowFile(id: string, name: string): string {
  return `id: ${id}\nname: ${name}\ninitial: done\nstates:\n  done:\n    type: final\n`;
}

/** Acme's two hubs, each with a workflow `reply`, and a root workflow that no run can start. */
async function acme(): Promise<LoadedWorkspace> {
  return loadWorkspace(
    new TestDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/sales/hub.yaml": "id: sales\nname: Sales\n",
      "hubs/sales/workflows/reply.workflow.yaml": workflowFile("reply", "Sales reply"),
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/workflows/reply.workflow.yaml": workflowFile("reply", "Support reply"),
      "hubs/support/workflows/support-reply.workflow.yaml": workflowFile(
        "support-reply",
        "Support reply",
      ),
      "workflows/shared.workflow.yaml": workflowFile("shared", "Shared"),
    }),
  );
}

verifies("app.workflow-lookup", () => {
  it("lists the workflows of every hub, and none at the workspace root", async () => {
    const workflows = hubWorkflows(await acme());

    expect(workflows.map((each) => `${each.hubId}/${each.workflow.id}`)).toEqual([
      "sales/reply",
      "support/reply",
      "support/support-reply",
    ]);
  });

  it("finds a workflow by its id when one hub has it", async () => {
    const lookup = lookUpWorkflow(hubWorkflows(await acme()), "support-reply");

    expect(lookup).toMatchObject({
      found: "one",
      hubId: "support",
      workflow: { name: "Support reply" },
    });
  });

  it("names the hubs when two have a workflow with that id", async () => {
    const lookup = lookUpWorkflow(hubWorkflows(await acme()), "reply");

    expect(lookup).toEqual({ found: "several", workflowId: "reply", hubIds: ["sales", "support"] });
  });

  it("finds a workflow by hub and id", async () => {
    const lookup = lookUpWorkflow(hubWorkflows(await acme()), "sales/reply");

    expect(lookup).toMatchObject({
      found: "one",
      hubId: "sales",
      workflow: { name: "Sales reply" },
    });
  });

  it("finds nothing for an unknown id, an unknown hub, or a root workflow", async () => {
    const workflows = hubWorkflows(await acme());

    expect(lookUpWorkflow(workflows, "suport-reply")).toEqual({ found: "none" });
    expect(lookUpWorkflow(workflows, "billing/reply")).toEqual({ found: "none" });
    expect(lookUpWorkflow(workflows, "shared")).toEqual({ found: "none" });
  });

  it("finds a run's workflow by its hub and id, and nothing once it's gone", async () => {
    const workflows = hubWorkflows(await acme());

    expect(workflowIn(workflows, "support", "reply")?.name).toBe("Support reply");
    expect(workflowIn(workflows, "support", "mail-triage")).toBeUndefined();
  });
});
