import { AgentHostError } from "@halonicjs/adapter-agent-host-client";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { ProposedRecord } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { hostDoneProposalsOf } from "./host-proposals.ts";
import { WorkspaceRuns } from "./workspace-runs.ts";

const workspace = "/work/acme";

const settled: ProposedRecord = {
  state: "proposed",
  proposal: {
    runId: "01JD8Q",
    history: "off",
    base: null,
    ref: null,
    files: [{ path: "notes.md", change: "added", base: "absent" }],
    items: ["triage"],
  },
  finishedAt: "2026-11-20T10:00:00.000Z",
  decisions: { "notes.md": "rejected" },
  settled: { at: "2026-11-21T09:00:00.000Z", why: "decided" },
};

/** An agent host that answers every request with `status` and `body`, and records what it was asked. */
function hostAnswering(status: number, body: unknown) {
  const request = vi.fn(async (_route: string, _body: unknown) => ({ status, body }));
  const stream = async () => {
    throw new Error("No streams here.");
  };
  return { request, transport: { request, stream } };
}

const refusing = (status: number, kind: string) =>
  hostAnswering(status, { error: { kind, message: "No." } }).transport;

verifies("studio.workspace-done-proposals", () => {
  it("lists what the host settled, asking with only the workspace, each with its run's record", async () => {
    const { transport, request } = hostAnswering(200, { proposals: [settled] });
    const runs = new WorkspaceRuns({
      runs: { list: async () => [], events: async () => [] },
      definitions: new MemoryDefinitionStore({ "workspace.yaml": "id: acme\nname: Acme\n" }),
      doneProposals: hostDoneProposalsOf(transport, workspace, () => true),
    });

    expect(await runs.doneProposals()).toEqual([{ record: settled, run: undefined }]);
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/done", { workspace });
  });

  it("asks the host nothing while the workspace isn't trusted", async () => {
    const { transport, request } = hostAnswering(200, { proposals: [settled] });
    expect(await hostDoneProposalsOf(transport, workspace, () => false)()).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("lists none from a host that doesn't serve proposals here, and throws any other failure", async () => {
    for (const kind of ["not_found", "unknown_workspace"]) {
      expect(await hostDoneProposalsOf(refusing(404, kind), workspace, () => true)()).toEqual([]);
    }
    const failure = await hostDoneProposalsOf(
      refusing(422, "proposal_refused"),
      workspace,
      () => true,
    )().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AgentHostError);
  });
});
