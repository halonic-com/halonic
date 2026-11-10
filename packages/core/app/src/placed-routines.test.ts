import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { placedRoutines } from "./workspace-routines.ts";

const digest = [
  "id: digest",
  "name: Morning digest",
  'trigger: { schedule: "0 8 * * *" }',
  "run: { workflow: digest }",
].join("\n");

const backup = [
  "id: backup",
  "name: Nightly backup",
  'trigger: { schedule: "0 2 * * *" }',
  "run: { hub: acme, workflow: backup }",
].join("\n");

async function routinesOf(files: Record<string, string>) {
  const workspace = await loadWorkspace(new TestDefinitionStore(files));
  return placedRoutines(workspace).map((placed) => [placed.hub, placed.routine.id]);
}

verifies("app.placed-routines", () => {
  it("gives each routine file with its hub, and nothing for other files", async () => {
    const routines = await routinesOf({
      "hubs/acme/workflows/routines/digest.routine.yaml": digest,
      "workflows/routines/backup.routine.yaml": backup,
      "hubs/acme/agents/writer.agent.yaml": "name: Writer\n",
    });

    expect(routines).toEqual([
      ["acme", "digest"],
      [null, "backup"],
    ]);
  });

  it("leaves out a routine file that doesn't parse", async () => {
    const routines = await routinesOf({
      "hubs/acme/workflows/routines/digest.routine.yaml": digest,
      "hubs/acme/workflows/routines/broken.routine.yaml": "id: [broken\n",
    });

    expect(routines).toEqual([["acme", "digest"]]);
  });

  it("keeps a routine whose workflow doesn't exist, so only its start fails", async () => {
    const workspace = await loadWorkspace(
      new TestDefinitionStore({ "hubs/acme/workflows/routines/digest.routine.yaml": digest }),
    );

    expect(workspace.issues.map((issue) => issue.code)).toContain("unknown-workflow");
    expect(placedRoutines(workspace).map((placed) => placed.routine.id)).toEqual(["digest"]);
  });
});
