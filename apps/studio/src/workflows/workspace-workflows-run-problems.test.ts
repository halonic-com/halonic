import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

/** One step that runs `agent`, then the final step. */
function workflowFile(id: string, step: string): string {
  return `id: ${id}\nname: ${id}\ninitial: first\nstates:\n  first:\n${step}    on:\n      - to: done\n  done:\n    type: final\n`;
}

/**
 * Acme on the test model, with `reply`, which runs `writer` and calls `triage`, and
 * `weekly-report`, which runs `clerk`; `changed` replaces or adds files.
 */
function acme(changed: Record<string, string> = {}) {
  const made = setup();
  Object.assign(made.store, {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
    "hubs/acme/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Write.\n",
    "hubs/acme/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\ninstructions: Sort.\n",
    "hubs/acme/agents/clerk.agent.yaml": "id: clerk\nname: Clerk\ninstructions: File.\n",
    "hubs/acme/workflows/reply.workflow.yaml": `id: reply\nname: Reply\ninitial: draft\nstates:\n  draft:\n    agent: writer\n    on:\n      - to: sort\n  sort:\n    type: workflow\n    workflow: triage\n    on:\n      - to: done\n  done:\n    type: final\n`,
    "hubs/acme/workflows/triage.workflow.yaml": workflowFile("triage", "    agent: sorter\n"),
    "hubs/acme/workflows/weekly-report.workflow.yaml": workflowFile(
      "weekly-report",
      "    agent: clerk\n",
    ),
    ...changed,
  });
  return made;
}

/** How many errors stop each listed workflow, by id. */
async function errorsById(host: ReturnType<typeof setup>["host"]) {
  return Object.fromEntries((await host.list()).map((each) => [each.id, each.problems.errors]));
}

// The same cases as `halonic run`'s (`apps/cli/src/commands/run/file-problems.test.ts`): both ask
// `errorsStoppingRun`, so Run is unavailable exactly when the CLI refuses (HAL-15127).
verifies("studio.workspace-workflows", () => {
  describe("which errors stop a workflow's run, as the CLI decides it (HAL-15127)", () => {
    it("has none while every file is sound", async () => {
      const { host } = acme();

      expect(await errorsById(host)).toEqual({ reply: 0, triage: 0, "weekly-report": 0 });
    });

    // C544-3 (HAL-15119): Run was unavailable only on weekly-report, while the CLI refused reply.
    it("stops only the workflow that names an unknown agent", async () => {
      const { host } = acme({
        "hubs/acme/workflows/weekly-report.workflow.yaml": workflowFile(
          "weekly-report",
          "    agent: ghost\n",
        ),
      });

      expect(await errorsById(host)).toEqual({ reply: 0, triage: 0, "weekly-report": 1 });
    });

    it.each([
      ["a provider", "providers/mock.yaml", "id: mock\nname: Test model\ntype: antropic\n"],
      ["workspace.yaml", "workspace.yaml", "version: 2\nid: acme\nname: Acme\n"],
      ["the hub's file", "hubs/acme/hub.yaml", "version: 2\nid: acme\nname: Acme\n"],
    ])("stops every workflow while %s has an error", async (_, path, text) => {
      const { host } = acme({ [path]: text });

      const errors = await errorsById(host);

      expect(Object.values(errors).every((count) => count > 0)).toBe(true);
    });

    it("stops a workflow while one it calls has an error, and gives it on Configuration", async () => {
      const { host } = acme({
        "hubs/acme/workflows/triage.workflow.yaml": `version: 2\n${workflowFile("triage", "    agent: sorter\n")}`,
      });

      const settings = await host.configuration({ hubId: "acme", id: "reply" });

      expect(await errorsById(host)).toMatchObject({ reply: 1, "weekly-report": 0 });
      // The called workflow's step isn't one of reply's.
      expect(settings.problems).toEqual([
        expect.objectContaining({ severity: "error", stepId: undefined }),
      ]);
    });

    it("stops the workflows whose agents call a default model alias no file has", async () => {
      const { host } = acme({
        "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
        "hubs/acme/agents/clerk.agent.yaml":
          "id: clerk\nname: Clerk\nmodel: fast\ninstructions: File.\n",
      });

      expect(await errorsById(host)).toEqual({ reply: 1, triage: 1, "weekly-report": 0 });
    });
  });
});
