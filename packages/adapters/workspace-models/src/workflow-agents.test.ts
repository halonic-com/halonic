import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startsAProgram, stateAgentsOf, workflowAgentsOf } from "./index.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-workflow-agents-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/support/workflows/reply.workflow.yaml": [
    "id: reply",
    "name: Reply",
    "initial: read",
    "states:",
    "  read:",
    "    agent: writer",
    "    on:",
    "      - to: check",
    "  check:",
    "    workflow: review",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n"),
  "hubs/support/workflows/review.workflow.yaml": [
    "id: review",
    "name: Review",
    "initial: look",
    "states:",
    "  look:",
    "    agent: sorter",
    "    on:",
    "      - to: read-again",
    "  read-again:",
    "    agent: writer",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n"),
  "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\n",
  "hubs/support/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\nharness: codex\n",
  "hubs/support/agents/idle.agent.yaml": "id: idle\nname: Idle\n",
};

/** The Acme workspace of `files`, loaded from a folder. */
async function acme() {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

verifies("cli.workspace-models", () => {
  describe("the agents a workflow runs", () => {
    it("lists each once, in the order named, through the workflows it starts", async () => {
      const workspace = await acme();

      const agents = workflowAgentsOf(workspace, { hubId: "support", workflowId: "reply" });

      expect(agents.map((agent) => agent.value.id)).toEqual(["writer", "sorter"]);
    });

    it("lists each state's own agents, and those of a workflow it starts", async () => {
      const workspace = await acme();

      const byState = stateAgentsOf(workspace, { hubId: "support", workflowId: "reply" });

      const ids = (state: string) => byState.get(state)?.map((agent) => agent.value.id);
      expect(ids("read")).toEqual(["writer"]);
      expect(ids("check")).toEqual(["sorter", "writer"]);
      expect(byState.has("done")).toBe(false);
      expect(stateAgentsOf(workspace, { hubId: "support", workflowId: "gone" }).size).toBe(0);
    });

    it("starts a program for any harness but Halonic's own", () => {
      expect(startsAProgram(undefined)).toBe(false);
      expect(startsAProgram("halonic")).toBe(false);
      expect(startsAProgram("codex")).toBe(true);
    });
  });
});
