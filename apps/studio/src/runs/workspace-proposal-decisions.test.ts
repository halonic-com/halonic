import { AgentHostError } from "@halonicjs/adapter-agent-host-client";
import { ProposalFailedError } from "@halonicjs/studio-feature-inbox/api";
import { AgentHostNotAnswering } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { hostProposalDecisionsOf } from "./host-proposals.ts";

const workspace = "/work/acme";
const file = "hubs/support/agents/triage.agent.yaml";

/** An agent host that answers every request with `body`, and records what it was asked. */
function hostAnswering(body: unknown, status = 200) {
  const request = vi.fn(async (_route: string, _body: unknown) => ({ status, body }));
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
      decidedAfter: false,
    });
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/restore", {
      workspace,
      undo: "u1",
      to: "before",
    });
  });

  it("says when a later decision kept the whole Undo back", async () => {
    const { transport } = hostAnswering({ changedOnDisk: [file], refused: [], decidedAfter: true });
    expect(await hostProposalDecisionsOf(transport, workspace, () => true).undo("u1")).toEqual({
      leftAlone: [file],
      decidedAfter: true,
    });
  });

  it("refuses without asking the host while the workspace isn't trusted", async () => {
    const { transport, request } = hostAnswering({ undo: "u2" });
    const decisions = hostProposalDecisionsOf(transport, workspace, () => false);

    await expect(decisions.reject("01JD8Q", { file })).rejects.toThrow("isn't trusted yet");
    await expect(decisions.accept("01JD8Q", { file })).rejects.toMatchObject({
      failure: "untrusted",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("calls a refusal one Halonic can't explain, keeping the host's words for details", async () => {
    const message = "The store refused to write the file.";
    const { transport } = hostAnswering({ error: { kind: "proposal_refused", message } }, 422);
    const decisions = hostProposalDecisionsOf(transport, workspace, () => true);

    const failure = await decisions.accept("01JD8Q", { file }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProposalFailedError);
    expect(failure).toMatchObject({ failure: "unexplained", message });
  });

  it("says the engine isn't answering when the host isn't running", async () => {
    const shell = new AgentHostError(0, "host_unavailable", "The shell refused the call.");
    const notAnswering = new AgentHostNotAnswering(shell);
    const transport = { request: () => Promise.reject(notAnswering), stream: vi.fn() };
    const decisions = hostProposalDecisionsOf(transport, workspace, () => true);

    await expect(decisions.undo("u1")).rejects.toMatchObject({ failure: "not-answering" });
  });
});
