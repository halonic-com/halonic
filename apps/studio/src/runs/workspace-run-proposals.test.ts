import { AgentHostError } from "@halonicjs/adapter-agent-host-client";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { ProposedRecord } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { publishCall, realEngine, replyStart, textAnswer } from "../inbox/real-runs.test-helper.ts";
import { hostProposalsOf } from "./host-proposals.ts";
import { WorkspaceRuns } from "./workspace-runs.ts";

const files = () =>
  new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support desk\n",
    "hubs/support/agents/triage.agent.yaml": "id: triage\nname: Support triage\n",
  });

function proposalOf(runId: string): ProposedRecord {
  return {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: [
        { path: "hubs/support/agents/triage.agent.yaml", change: "modified", base: "absent" },
      ],
      items: ["triage"],
    },
    finishedAt: "2026-11-21T10:00:00.000Z",
    decisions: { "hubs/support/agents/triage.agent.yaml": "undecided" },
  };
}

/** A run of the reply workflow that waits, standing in for one that proposed. */
async function oneRun() {
  const engine = realEngine([publishCall, textAnswer("Done.")]);
  const { id } = await engine.executor.start(replyStart);
  await engine.settle(id);
  return { store: engine.stores.store, runId: id };
}

verifies("studio.workspace-run-proposals", () => {
  it("gives each open proposal with its run's record, and the item's name from its file", async () => {
    const { store, runId } = await oneRun();
    const runs = new WorkspaceRuns({
      runs: store,
      definitions: files(),
      proposals: async () => [proposalOf(runId), proposalOf("01GONE")],
    });

    const entries = await runs.proposals();

    expect(entries.map((entry) => [entry.record.proposal.runId, entry.run?.id])).toEqual([
      [runId, runId],
      ["01GONE", undefined],
    ]);
    expect(runs.itemName("triage")).toBe("Support triage");
    expect(runs.itemName("support")).toBe("Support desk");
    expect(runs.itemName("nobody")).toBeUndefined();
  });

  it("lists none without the agent host, and reads no runs when there is no proposal", async () => {
    const list = vi.fn(async () => []);
    const none = new WorkspaceRuns({
      runs: { list, events: async () => [] },
      definitions: files(),
    });
    expect(await none.proposals()).toEqual([]);
    const empty = new WorkspaceRuns({
      runs: { list, events: async () => [] },
      definitions: files(),
      proposals: async () => [],
    });
    expect(await empty.proposals()).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it("lists none from a host that doesn't serve proposals here, and throws any other failure", async () => {
    const answering = (status: number, kind: string) => ({
      request: async () => ({ status, body: { error: { kind, message: "No." } } }),
      stream: async () => {
        throw new Error("No streams here.");
      },
    });
    for (const kind of ["not_found", "unknown_workspace"]) {
      expect(await hostProposalsOf(answering(404, kind), "/work/acme", () => true)()).toEqual([]);
    }
    const failure = await hostProposalsOf(
      answering(422, "proposal_refused"),
      "/work/acme",
      () => true,
    )().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AgentHostError);
  });

  it("asks the host nothing while the workspace isn't trusted", async () => {
    const request = vi.fn(async () => ({ status: 200, body: { proposals: [] } }));
    const transport = {
      request,
      stream: async () => {
        throw new Error("No streams here.");
      },
    };

    expect(await hostProposalsOf(transport, "/work/acme", () => false)()).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});
