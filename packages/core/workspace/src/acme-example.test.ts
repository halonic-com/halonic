import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, describe, expect, it } from "vitest";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

/** The repository's example workspace, which the docs and `halonic init --example acme` use. */
const acmeFolder = join(import.meta.dirname, "..", "..", "..", "..", "examples", "acme");

/** The example's files, read from disk into memory. */
function acmeFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of listFiles(acmeFolder)) {
    files[path] = readFileSync(join(acmeFolder, path), "utf8");
  }
  return files;
}

verifies("workspace.acme-example", () => {
  describe("examples/acme", () => {
    let workspace: LoadedWorkspace;
    // Like the parity workspace, loading takes seconds under a full verify.
    const loadLimitMs = 60_000;
    beforeAll(async () => {
      workspace = await loadWorkspace(new MemorySource(acmeFiles()));
    }, loadLimitMs);

    it("loads with no error and no warning", () => {
      expect(workspace.issues).toEqual([]);
      expect(workspace.ignored).toEqual(["README.md", "examples/refund-question.json"]);
    });

    it("has the hubs, agents, workflows and routine the texts count", () => {
      const ids = (kind: "hub" | "agent" | "workflow" | "routine") =>
        filesOf(workspace, kind).map((file) => file.path);

      expect(ids("hub")).toEqual(["hubs/reports/hub.yaml", "hubs/support/hub.yaml"]);
      expect(ids("agent")).toEqual([
        "hubs/reports/agents/reporter.agent.yaml",
        "hubs/support/agents/sorter.agent.yaml",
        "hubs/support/agents/writer.agent.yaml",
      ]);
      expect(ids("workflow")).toEqual([
        "hubs/reports/workflows/weekly-report.workflow.yaml",
        "hubs/support/workflows/support-reply.workflow.yaml",
      ]);
      expect(ids("routine")).toEqual([
        "hubs/reports/workflows/routines/weekly-report.routine.yaml",
      ]);
    });

    it("keeps the Support reply description whole, past the # of the order number", () => {
      const [workflow] = filesOf(workspace, "workflow").filter(
        (file) => file.value.id === "support-reply",
      );

      // The request form shows this text as the Message placeholder (HAL-2372).
      expect(workflow?.value.description).toBe(
        'A customer\'s mail, for example: "Hi, my order #1042 arrived damaged. Can I get a refund?"',
      );
    });

    it("tests the Support reply workflow with 5 cases, two of them on Sam's and Alex's mails", () => {
      const [tests] = filesOf(workspace, "workflowTest");
      const mails = tests?.value.cases.map((testCase) => String(testCase.input["mail"]));

      expect(tests?.value.workflow).toBe("support-reply");
      expect(mails).toHaveLength(5);
      expect(mails?.filter((mail) => mail.endsWith("— Sam (invented)"))).not.toEqual([]);
      expect(mails?.filter((mail) => mail.endsWith("— Alex (invented)"))).not.toEqual([]);
    });
  });
});
