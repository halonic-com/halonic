import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { hostProposalDecisionsOf } from "./host-proposals.ts";

const workspace = "/work/acme";
const file = "hubs/support/agents/triage.agent.yaml";

/** An agent host that answers every request with `body`, and records what it was asked. */
function hostAnswering(body: unknown) {
  const request = vi.fn(async (_route: string, _body: unknown) => ({ status: 200, body }));
  return {
    request,
    transport: {
      request,
      stream: async () => {
        throw new Error("No streams here.");
      },
    },
  };
}

verifies("studio.workspace-proposal-decisions", () => {
  it("accepts through the host, with what was left alone", async () => {
    const { transport, request } = hostAnswering({
      undo: "u1",
      written: [file],
      changedOnDisk: [],
      refused: [{ path: ".git/config", why: "under-git" }],
    });
    const decisions = hostProposalDecisionsOf(transport, workspace, () => true);

    expect(await decisions.accept("01JD8Q", "all")).toEqual({
      undo: "u1",
      changedSinceRun: [],
      cantBeWritten: [".git/config"],
    });
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/accept", {
      workspace,
      runId: "01JD8Q",
      target: "all",
    });
  });

  it("undoes by the host's id, to before, with what it left alone", async () => {
    const { transport, request } = hostAnswering({
      changedOnDisk: [file],
      refused: [{ path: ".git/config", why: "under-git" }],
      decidedAfter: false,
    });
    expect(await hostProposalDecisionsOf(transport, workspace, () => true).undo("u1")).toEqual({
      leftAlone: [file, ".git/config"],
    });
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/restore", {
      workspace,
      undo: "u1",
      to: "before",
    });
  });

  it("refuses without asking the host while the workspace isn't trusted", async () => {
    const { transport, request } = hostAnswering({ undo: "u2" });
    const decisions = hostProposalDecisionsOf(transport, workspace, () => false);

    await expect(decisions.reject("01JD8Q", { file })).rejects.toThrow("isn't trusted yet");
    expect(request).not.toHaveBeenCalled();
  });
});
