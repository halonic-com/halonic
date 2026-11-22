import { AgentHostError, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ProposalFailedError, ProposalGoneError } from "@halonicjs/studio-feature-inbox/api";
import { AgentHostNotAnswering } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { hostProposalDecisionsOf } from "./host-proposals.ts";

const workspace = "/work/acme";

/** An agent host that answers every request with `status` and `body`, and records what it was asked. */
function hostAnswering(status: number, body: unknown) {
  const request = vi.fn(async (_route: string, _body: unknown) => ({ status, body }));
  const stream = async () => {
    throw new Error("No streams here.");
  };
  return { request, transport: { request, stream } };
}

verifies("studio.workspace-proposal-remove", () => {
  it("tells the Inbox a proposal is gone when the host says its texts are", async () => {
    const message = "Run 01JD8Q's branch is gone.";
    const { transport } = hostAnswering(409, {
      error: { kind: "proposal_unavailable", message },
    });
    const failure = await hostProposalDecisionsOf(transport, workspace, () => true)
      .accept("01JD8Q", "all")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProposalGoneError);
    expect(failure).toMatchObject({ message });
  });

  it("removes through the host with only the workspace and the run", async () => {
    const { transport, request } = hostAnswering(200, {});
    await hostProposalDecisionsOf(transport, workspace, () => true).remove("01JD8Q");
    expect(request).toHaveBeenCalledWith("POST /v1/proposals/remove", {
      workspace,
      runId: "01JD8Q",
    });
  });

  it("refuses without asking the host while the workspace isn't trusted", async () => {
    const { transport, request } = hostAnswering(200, {});
    const decisions = hostProposalDecisionsOf(transport, workspace, () => false);
    await expect(decisions.remove("01JD8Q")).rejects.toThrow("isn't trusted yet");
    expect(request).not.toHaveBeenCalled();
  });

  it("says a Remove the host refused found the changes there again, keeping its words for details", async () => {
    const message = "The proposal of run 01JD8Q is still available.";
    const { transport } = hostAnswering(422, { error: { kind: "proposal_refused", message } });
    const failure = await removedWith(transport);
    expect(failure).toBeInstanceOf(ProposalFailedError);
    expect(failure).toMatchObject({ failure: "changes-back", message });
  });

  it("says the engine isn't answering when the host isn't running", async () => {
    const shell = new AgentHostError(0, "host_unavailable", "The shell refused the call.");
    const failure = await removedWith(failingWith(new AgentHostNotAnswering(shell)));
    expect(failure).toMatchObject({ failure: "not-answering" });
  });

  it("calls any other failure one Halonic can't explain", async () => {
    const { transport } = hostAnswering(500, { error: { kind: "internal" } });
    expect(await removedWith(transport)).toMatchObject({ failure: "unexplained" });
    const shell = new AgentHostError(0, "shell_failed", "The shell's call failed.");
    expect(await removedWith(failingWith(shell))).toMatchObject({ failure: "unexplained" });
  });
});

/** What removing run `01JD8Q`'s proposal through `transport` fails with. */
function removedWith(transport: AgentHostTransport): Promise<unknown> {
  return hostProposalDecisionsOf(transport, workspace, () => true)
    .remove("01JD8Q")
    .then(() => expect.unreachable("The Remove went through."))
    .catch((error: unknown) => error);
}

/** A transport whose every request rejects with `error`, as the shell's refusals do. */
function failingWith(error: Error): AgentHostTransport {
  return {
    request: async () => Promise.reject(error),
    stream: async () => Promise.reject(error),
  };
}
