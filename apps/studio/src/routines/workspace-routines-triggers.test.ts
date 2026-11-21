import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-routines.test-helper.ts";

/** A workflow file of acme with one step `step` that runs `run` (`agent: …` or `workflow: …`). */
const workflowFile = (id: string, name: string, run: string) =>
  [
    `id: ${id}`,
    `name: ${name}`,
    "initial: step",
    "states:",
    "  step:",
    `    ${run}`,
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");

verifies("studio.workspace-routines", () => {
  it("lists the workflows that run an agent as a step, directly or in a workflow they call", async () => {
    const { host } = setup({}, [], {
      "hubs/acme/workflows/digest.workflow.yaml": workflowFile(
        "digest",
        "Digest",
        "workflow: draft",
      ),
      "hubs/acme/workflows/draft.workflow.yaml": workflowFile("draft", "Draft", "agent: analyst"),
    });
    const analyst = { kind: "agent", hubId: "acme", id: "analyst" } as const;
    expect(await host.workflowsWithAgent(analyst)).toEqual([
      { id: "digest", name: "Digest" },
      { id: "draft", name: "Draft" },
    ]);
    expect(await host.workflowsWithAgent({ ...analyst, hubId: "beta" })).toEqual([]);
  });
});
