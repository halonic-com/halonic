import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { errorsStoppingRun, loadWorkspace, type WorkspaceIssue, workflowUses } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

const supportReply = { hubId: "support", workflowId: "support-reply" };

/** One step that runs `agent`, then the final step. */
function workflowFile(id: string, step: string): string {
  return `id: ${id}\nname: ${id}\ninitial: first\nstates:\n  first:\n${step}    on:\n      - to: done\n  done:\n    type: final\n`;
}

/**
 * An Acme with the support hub's `support-reply`, which runs `writer` and calls `triage`, which
 * runs `sorter`; `clerk` and `weekly-report` are the hub's other agent and workflow.
 */
const acme: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Write.\n",
  "hubs/support/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\ninstructions: Sort.\n",
  "hubs/support/agents/clerk.agent.yaml": "id: clerk\nname: Clerk\ninstructions: File.\n",
  "hubs/support/workflows/support-reply.workflow.yaml": `id: support-reply\nname: Support reply\ninitial: draft\nstates:\n  draft:\n    agent: writer\n    on:\n      - to: sort\n  sort:\n    type: workflow\n    workflow: triage\n    on:\n      - to: done\n  done:\n    type: final\n`,
  "hubs/support/workflows/triage.workflow.yaml": workflowFile("triage", "    agent: sorter\n"),
  "hubs/support/workflows/weekly-report.workflow.yaml": workflowFile(
    "weekly-report",
    "    agent: clerk\n",
  ),
};

/** An error the checks found in `file`. */
function errorIn(file: string, code = "invalid-value"): WorkspaceIssue {
  return {
    file,
    severity: "error",
    source: "check",
    code,
    path: [],
    line: 1,
    col: 1,
    message: "Broken",
  };
}

/** The errors that stop `support-reply` in Acme with `changed` files, given `issues`. */
async function stopping(issues: WorkspaceIssue[], changed: Record<string, string> = {}) {
  const workspace = await loadWorkspace(new MemorySource({ ...acme, ...changed }));
  return errorsStoppingRun(workspace, [...workspace.issues, ...issues], supportReply);
}

verifies("workspace.run-problems", () => {
  it("finds what a workflow uses, through the workflows it calls", async () => {
    const workspace = await loadWorkspace(new MemorySource(acme));

    expect(workspace.issues).toEqual([]);
    expect(workflowUses(workspace, supportReply)).toEqual({
      workflows: ["support-reply", "triage"],
      agents: ["writer", "sorter"],
      subagents: [],
    });
  });

  // C544-3 (HAL-15119): Studio ran support-reply while the CLI refused it.
  it("isn't stopped by another workflow naming an unknown agent", async () => {
    const broken = {
      "hubs/support/workflows/weekly-report.workflow.yaml": workflowFile(
        "weekly-report",
        "    agent: ghost\n",
      ),
    };

    const workspace = await loadWorkspace(new MemorySource({ ...acme, ...broken }));

    expect(workspace.issues).toContainEqual(
      expect.objectContaining({
        file: "hubs/support/workflows/weekly-report.workflow.yaml",
        severity: "error",
      }),
    );
    expect(errorsStoppingRun(workspace, workspace.issues, supportReply)).toEqual([]);
  });

  describe("is stopped by an error in", () => {
    it.each([
      ["its own file", "hubs/support/workflows/support-reply.workflow.yaml"],
      ["an agent it runs", "hubs/support/agents/writer.agent.yaml"],
      ["a workflow it calls", "hubs/support/workflows/triage.workflow.yaml"],
      ["an agent of a workflow it calls", "hubs/support/agents/sorter.agent.yaml"],
      ["workspace.yaml", "workspace.yaml"],
      ["its hub file", "hubs/support/hub.yaml"],
      ["another hub's file", "hubs/reports/hub.yaml"],
      ["a provider", "providers/mock.yaml"],
      ["models.yaml", "models.yaml"],
      ["a file no kind places", "hubs/support/notes.txt"],
      ["no file", ""],
    ])("%s", async (_, file) => {
      expect(await stopping([errorIn(file)])).toEqual([errorIn(file)]);
    });

    it("a workflow it calls whose file doesn't load", async () => {
      const found = await stopping([], {
        "hubs/support/workflows/triage.workflow.yaml": "id: [\n",
      });

      expect(found.map((issue) => issue.file)).toEqual([
        "hubs/support/workflows/triage.workflow.yaml",
      ]);
    });
  });

  describe("isn't stopped by an error in", () => {
    it.each([
      ["another workflow", "hubs/support/workflows/weekly-report.workflow.yaml"],
      ["an agent it doesn't use", "hubs/support/agents/clerk.agent.yaml"],
      ["another hub's workflow", "hubs/reports/workflows/support-reply.workflow.yaml"],
      ["another hub's agent", "hubs/reports/agents/writer.agent.yaml"],
      ["its test file", "hubs/support/workflows/support-reply.test.yaml"],
    ])("%s", async (_, file) => {
      expect(await stopping([errorIn(file)])).toEqual([]);
    });

    it("any file, when the problem is only a warning", async () => {
      expect(await stopping([{ ...errorIn("workspace.yaml"), severity: "warning" }])).toEqual([]);
    });
  });

  // Liam's review of #4496: a run loads the subagents of its agents and hands them tasks.
  describe("through subagents", () => {
    const checkerPath = "hubs/support/agents/checker.agent.yaml";
    const writerHandsToChecker = {
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Write.\nsubagents: [checker]\n",
      "hubs/support/agents/checker.agent.yaml":
        "id: checker\nname: Checker\ninstructions: Check.\nsubagents: [proofer]\n",
      "hubs/support/agents/proofer.agent.yaml":
        "id: proofer\nname: Proofer\ninstructions: Proof.\n",
    };

    it("finds the subagents of its agents, all the way down", async () => {
      const workspace = await loadWorkspace(new MemorySource({ ...acme, ...writerHandsToChecker }));

      expect(workflowUses(workspace, supportReply).subagents).toEqual(["checker", "proofer"]);
    });

    it.each([
      ["a subagent of an agent it runs", checkerPath],
      ["a subagent of that subagent", "hubs/support/agents/proofer.agent.yaml"],
    ])("is stopped by an error in %s", async (_, file) => {
      expect(await stopping([errorIn(file)], writerHandsToChecker)).toEqual([errorIn(file)]);
    });

    it("is stopped by a subagent whose file doesn't load", async () => {
      const found = await stopping([], { ...writerHandsToChecker, [checkerPath]: "id: [\n" });

      expect(found.map((issue) => issue.file)).toContain(checkerPath);
    });

    it("isn't stopped by an agent that is nobody's subagent", async () => {
      const alone = { [checkerPath]: "id: checker\nname: Checker\ninstructions: Check.\n" };

      expect(await stopping([errorIn(checkerPath)], alone)).toEqual([]);
    });

    it("is stopped by the default model problem when only a subagent names no model", async () => {
      const onClerk = errorIn("hubs/support/agents/clerk.agent.yaml", "unknown-default-model");
      const found = await stopping([onClerk], {
        ...writerHandsToChecker,
        "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
        "hubs/support/agents/writer.agent.yaml":
          "id: writer\nname: Writer\nmodel: mock/echo\ninstructions: Write.\nsubagents: [checker]\n",
        "hubs/support/agents/sorter.agent.yaml":
          "id: sorter\nname: Sorter\nmodel: mock/echo\ninstructions: Sort.\n",
        "hubs/support/agents/checker.agent.yaml":
          "id: checker\nname: Checker\nmodel: mock/echo\ninstructions: Check.\nsubagents: [proofer]\n",
      });

      expect(found).toEqual([onClerk]);
    });
  });

  describe("the default model problem, reported on the hub's agent clerk", () => {
    const onClerk = errorIn("hubs/support/agents/clerk.agent.yaml", "unknown-default-model");

    it("stops it when an agent it uses names no model", async () => {
      expect(await stopping([onClerk])).toEqual([onClerk]);
    });

    it("doesn't stop it when its agents name a model or start a program", async () => {
      const found = await stopping([onClerk], {
        "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
        "hubs/support/agents/writer.agent.yaml":
          "id: writer\nname: Writer\nmodel: mock/echo\ninstructions: Write.\n",
        "hubs/support/agents/sorter.agent.yaml":
          "id: sorter\nname: Sorter\nharness: claude-code\ninstructions: Sort.\n",
      });

      expect(found).toEqual([]);
    });

    it("doesn't stop a workflow of another hub", async () => {
      const onReports = errorIn("hubs/reports/agents/reporter.agent.yaml", "unknown-default-model");

      expect(await stopping([onReports])).toEqual([]);
    });
  });

  it("is stopped by every error when the workflow didn't load", async () => {
    const workspace = await loadWorkspace(new MemorySource(acme));
    const errors = [errorIn("hubs/support/workflows/weekly-report.workflow.yaml")];

    expect(errorsStoppingRun(workspace, errors, { hubId: "support", workflowId: "gone" })).toEqual(
      errors,
    );
  });
});
